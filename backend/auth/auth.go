package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
	"net/http"
	"github.com/dgrijalva/jwt-go"
	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	redisClient *redis.Client
	jwtSecret   string
}

type User struct {
	ID           int    `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
}

func NewAuthService(redisClient *redis.Client, jwtSecret string) *AuthService {
	return &AuthService{
		redisClient: redisClient,
		jwtSecret:   jwtSecret,
	}
}

func InitializeDB(redisClient *redis.Client) error {
	ctx := context.Background()
	key := "user:admin"
	exists, err := redisClient.Exists(ctx, key).Result()
	if err != nil {
		log.Printf("Error checking user existence in Redis: %v", err)
		return err
	}
	if exists == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Error generating password hash: %v", err)
			return err
		}
		user := User{
			ID:           1,
			Username:     "admin",
			PasswordHash: string(hash),
		}
		userData, err := json.Marshal(user)
		if err != nil {
			log.Printf("Error marshaling user data: %v", err)
			return err
		}
		err = redisClient.Set(ctx, key, userData, 0).Err()
		if err != nil {
			log.Printf("Error storing user in Redis: %v", err)
			return err
		}
		log.Println("Default admin user created")
	}
	return nil
}

func validateInput(input string) error {
	trimmedInput := strings.TrimSpace(input)
	if len(trimmedInput) < 3 || len(trimmedInput) > 50 {
		return fmt.Errorf("input must be between 3 and 50 characters, got: %s", trimmedInput)
	}
	return nil
}

func (s *AuthService) Login(username, password string) (string, error) {
	log.Printf("Attempting login with username: %q, password length: %d", username, len(password))
	if err := validateInput(username); err != nil {
		log.Printf("Invalid username: %v", err)
		return "", echo.NewHTTPError(400, err.Error())
	}
	if err := validateInput(password); err != nil {
		log.Printf("Invalid password: %v", err)
		return "", echo.NewHTTPError(400, err.Error())
	}

	ctx := context.Background()
	key := "user:" + username
	userData, err := s.redisClient.Get(ctx, key).Result()
	if err == redis.Nil {
		log.Printf("Failed login for '%s': user not found", username)
		return "", echo.NewHTTPError(401, "Invalid credentials")
	}
	if err != nil {
		log.Printf("Error retrieving user from Redis: %v", err)
		return "", echo.NewHTTPError(500, "Failed to retrieve user")
	}

	var user User
	if err := json.Unmarshal([]byte(userData), &user); err != nil {
		log.Printf("Error parsing user data: %v", err)
		return "", echo.NewHTTPError(500, "Failed to parse user data")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		log.Printf("Failed login for '%s': invalid password", username)
		return "", echo.NewHTTPError(401, "Invalid credentials")
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      time.Now().Add(time.Hour * 24).Unix(),
	})
	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		log.Printf("Error generating token: %v", err)
		return "", echo.NewHTTPError(500, "Failed to generate token")
	}

	// Store session in Redis
	sessionKey := fmt.Sprintf("session:user:%d:%s", user.ID, tokenString)
	err = s.redisClient.Set(ctx, sessionKey, user.ID, 24*time.Hour).Err()
	if err != nil {
		log.Printf("Error storing session in Redis: %v", err)
		return "", echo.NewHTTPError(500, "Failed to store session")
	}

	log.Printf("Successful login for user: %s, session key: %s", username, sessionKey)
	return tokenString, nil
}

func (s *AuthService) Logout(tokenString string, userID int) error {
	ctx := context.Background()
	sessionKey := fmt.Sprintf("session:user:%d:%s", userID, tokenString)
	err := s.redisClient.Del(ctx, sessionKey).Err()
	if err != nil {
		log.Printf("Error deleting session for user %d: %v", userID, err)
	}
	log.Printf("User %d logged out successfully", userID)
	return nil
}

func (s *AuthService) ChangePassword(userID int, newPassword string) error {
	if err := validateInput(newPassword); err != nil {
		log.Printf("Invalid new password: %v", err)
		return echo.NewHTTPError(400, err.Error())
	}

	ctx := context.Background()
	var user User
	keys, err := s.redisClient.Keys(ctx, "user:*").Result()
	if err != nil {
		log.Printf("Error fetching user keys: %v", err)
		return err
	}
	for _, key := range keys {
		userData, err := s.redisClient.Get(ctx, key).Result()
		if err != nil {
			log.Printf("Error retrieving user data for key %s: %v", key, err)
			continue
		}
		if err := json.Unmarshal([]byte(userData), &user); err != nil {
			log.Printf("Error parsing user data for key %s: %v", key, err)
			continue
		}
		if user.ID == userID {
			hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
			if err != nil {
				log.Printf("Error generating password hash: %v", err)
				return err
			}
			user.PasswordHash = string(hash)
			userData, err := json.Marshal(user)
			if err != nil {
				log.Printf("Error marshaling user data: %v", err)
				return err
			}
			log.Printf("Password changed for user: %s", user.Username)
			return s.redisClient.Set(ctx, key, userData, 0).Err()
		}
	}
	log.Printf("User %d not found for password change", userID)
	return errors.New("user not found")
}

func AuthMiddleware(authService *AuthService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" || len(authHeader) < 7 || authHeader[:7] != "Bearer " {
				log.Printf("Missing or invalid Authorization header: %s", authHeader)
				return echo.NewHTTPError(http.StatusUnauthorized, "Missing or invalid Authorization header")
			}

			tokenStr := authHeader[7:]
			token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					log.Printf("Invalid token signing method")
					return nil, echo.NewHTTPError(http.StatusUnauthorized, "Invalid token signing method")
				}
				return []byte(authService.jwtSecret), nil
			})
			if err != nil {
				log.Printf("Token parsing error: %v", err)
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token")
			}
			if !token.Valid {
				log.Printf("Token is invalid")
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token")
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				log.Printf("Invalid token claims")
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token claims")
			}

			userIDFloat, ok := claims["user_id"].(float64)
			if !ok {
				log.Printf("Invalid user_id in token payload")
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token payload")
			}
			username, ok := claims["username"].(string)
			if !ok {
				log.Printf("Invalid username in token payload")
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token payload")
			}
			userID := int(userIDFloat)

			// Verify session in Redis
			ctx := context.Background()
			sessionKey := fmt.Sprintf("session:user:%d:%s", userID, tokenStr)
			_, err = authService.redisClient.Get(ctx, sessionKey).Result()
			if err == redis.Nil {
				log.Printf("Session not found for user %d: %s", userID, sessionKey)
				return echo.NewHTTPError(http.StatusUnauthorized, "Session expired or invalid")
			}
			if err != nil {
				log.Printf("Error checking session in Redis: %v", err)
				return echo.NewHTTPError(http.StatusInternalServerError, "Failed to verify session")
			}

			// Extend session duration on activity
			err = authService.redisClient.Expire(ctx, sessionKey, 24*time.Hour).Err()
			if err != nil {
				log.Printf("Error extending session: %v", err)
			}

			log.Printf("Authentication successful for user %d (%s)", userID, username)
			c.Set("user_id", userID)
			c.Set("username", username)
			return next(c)
		}
	}
}