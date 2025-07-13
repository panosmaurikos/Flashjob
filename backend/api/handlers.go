package api

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"io/ioutil"

	"github.com/labstack/echo/v4"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/auth"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/models"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/services"
	"gopkg.in/yaml.v3"
)

func RegisterRoutes(e *echo.Echo, authService *auth.AuthService, k8sService *services.KubernetesService, redisService *services.RedisService, logger *log.Logger) {
	e.POST("/api/login", loginHandler(authService))
	e.POST("/api/logout", logoutHandler(authService), auth.AuthMiddleware(authService))
	e.POST("/api/change-password", changePasswordHandler(authService), auth.AuthMiddleware(authService))
	e.POST("/api/logs/add", addLogHandler(redisService, logger), auth.AuthMiddleware(authService))
	e.GET("/api/validate-session", validateSessionHandler(authService), auth.AuthMiddleware(authService))

	r := e.Group("")
	r.Use(auth.AuthMiddleware(authService))
	r.GET("/api/akri-instances", getAkriInstancesHandler(k8sService, redisService, logger))
	r.POST("/api/filter-instances", filterInstancesHandler(k8sService, redisService, logger))
	r.POST("/api/generate-yaml", generateYAMLHandler(k8sService, redisService, logger))
	r.GET("/api/logs", getLogsHandler(redisService, logger))
	r.GET("/api/logs/file", getFileLogsHandler(logger))
}

func loginHandler(authService *auth.AuthService) echo.HandlerFunc {
	return func(c echo.Context) error {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.Bind(&req); err != nil {
			log.Printf("Error binding login request: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
		}
		token, err := authService.Login(req.Username, req.Password)
		if err != nil {
			return err
		}
		log.Printf("Login successful for user: %s", req.Username)
		return c.JSON(http.StatusOK, map[string]string{"token": token})
	}
}

func logoutHandler(authService *auth.AuthService) echo.HandlerFunc {
	return func(c echo.Context) error {
		userID := c.Get("user_id").(int)
		authHeader := c.Request().Header.Get("Authorization")
		if authHeader == "" || len(authHeader) < 7 || authHeader[:7] != "Bearer " {
			log.Printf("Missing or invalid Authorization header during logout: %s", authHeader)
			return echo.NewHTTPError(http.StatusBadRequest, "Missing or invalid Authorization header")
		}
		tokenStr := authHeader[7:]
		if err := authService.Logout(tokenStr, userID); err != nil {
			log.Printf("Logout error for user %d: %v", userID, err)
			return err
		}
		log.Printf("Logout successful for user %d", userID)
		return c.JSON(http.StatusOK, map[string]string{"message": "Logged out successfully"})
	}
}

func validateSessionHandler(authService *auth.AuthService) echo.HandlerFunc {
	return func(c echo.Context) error {
		userID, ok := c.Get("user_id").(int)
		if !ok {
			log.Printf("Invalid user_id in context")
			return echo.NewHTTPError(http.StatusInternalServerError, "Invalid user_id in context")
		}
		username, ok := c.Get("username").(string)
		if !ok {
			log.Printf("Invalid username in context")
			return echo.NewHTTPError(http.StatusInternalServerError, "Invalid username in context")
		}
		log.Printf("Session validated for user %d (%s)", userID, username)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":  "Session is valid",
			"user_id":  userID,
			"username": username,
		})
	}
}

func changePasswordHandler(authService *auth.AuthService) echo.HandlerFunc {
	return func(c echo.Context) error {
		userID := c.Get("user_id").(int)
		var req struct {
			NewPassword string `json:"newPassword"`
		}
		if err := c.Bind(&req); err != nil {
			log.Printf("Error binding change password request: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
		}
		err := authService.ChangePassword(userID, req.NewPassword)
		if err != nil {
			log.Printf("Error changing password for user %d: %v", userID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to change password")
		}
		log.Printf("Password changed successfully for user %d", userID)
		return c.JSON(http.StatusOK, map[string]string{"message": "Password changed successfully"})
	}
}

func addLogHandler(redisService *services.RedisService, logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		var req struct {
			Timestamp float64 `json:"timestamp"`
			Message   string  `json:"message"`
			Type      string  `json:"type"`
		}
		if err := c.Bind(&req); err != nil {
			logger.Printf("Error binding log entry: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
		}
		logEntry := models.LogEntry{
			Timestamp: int64(req.Timestamp),
			Message:   req.Message,
			Type:      req.Type,
		}
		redisService.LPushList("logs", logEntry)
		redisService.SetExpiration("logs", 48*time.Hour)
		logger.Printf("Log added: %s (%s)", logEntry.Message, logEntry.Type)
		return c.JSON(http.StatusOK, map[string]string{"message": "Log added successfully"})
	}
}

func getAkriInstancesHandler(k8sService *services.KubernetesService, redisService *services.RedisService, logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		instances, err := k8sService.GetAkriInstances()
		if err != nil {
			logger.Printf("Error getting Akri instances: %v", err)
			return c.JSON(http.StatusOK, map[string]interface{}{
				"instances": []models.AkriInstance{},
				"error":     "Failed to connect to Kubernetes",
			})
		}
		redisService.SetValue("akri_instances", instances)
		logger.Printf("Retrieved %d Akri instances", len(instances))
		return c.JSON(http.StatusOK, map[string][]models.AkriInstance{"instances": instances})
	}
}

func filterInstancesHandler(k8sService *services.KubernetesService, redisService *services.RedisService, logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		var filters struct {
			UUID           string `json:"uuid"`
			DeviceType     string `json:"deviceType"`
			ApplicationType string `json:"applicationType"`
			Status         string `json:"status"`
			LastUpdated    string `json:"lastUpdated"`
		}
		if err := c.Bind(&filters); err != nil {
			logger.Printf("Error binding filter request: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
		}
		instances, err := k8sService.GetAkriInstances()
		if err != nil {
			logger.Printf("Error getting Akri instances: %v", err)
			return c.JSON(http.StatusOK, map[string]interface{}{
				"instances": []models.AkriInstance{},
				"error":     "Failed to connect to Kubernetes",
			})
		}
		filtered := k8sService.FilterInstances(instances, filters.UUID, filters.DeviceType, filters.ApplicationType, filters.Status, filters.LastUpdated)
		redisService.SetValue("filtered_instances", filtered)
		logger.Printf("Filtered %d instances", len(filtered))
		return c.JSON(http.StatusOK, filtered)
	}
}

func generateYAMLHandler(k8sService *services.KubernetesService, redisService *services.RedisService, logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		var req struct {
			UUIDs           []string `json:"uuids"`
			Firmware        string   `json:"firmware"`
			FlashjobPodImage string   `json:"flashjobPodImage"`
		}
		if err := c.Bind(&req); err != nil {
			logger.Printf("Error binding YAML request: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
		}
		if len(req.UUIDs) == 0 || req.Firmware == "" {
			logger.Printf("Invalid YAML request: empty UUIDs or firmware")
			return echo.NewHTTPError(http.StatusBadRequest, "UUIDs and firmware are required")
		}
		req.FlashjobPodImage = strings.TrimSpace(req.FlashjobPodImage)
		if req.FlashjobPodImage == "" {
			req.FlashjobPodImage = "harbor.nbfc.io/nubificus/iot_esp32-flashjob:local"
		}

		flashjob := map[string]interface{}{
			"apiVersion": "application.flashjob.nbfc.io/v1alpha1",
			"kind":       "FlashJob",
			"metadata": map[string]interface{}{
				"name":      "flashjob-" + req.UUIDs[0][:8],
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"applicationType":  nil,
				"device":          nil,
				"externalIP":      nil,
				"firmware":        req.Firmware,
				"flashjobPodImage": req.FlashjobPodImage,
				"hostEndpoint":    nil,
				"uuid":            req.UUIDs,
				"version":         "0.2.0",
			},
		}

		yamlData, err := yaml.Marshal(flashjob)
		if err != nil {
			logger.Printf("Error marshaling YAML: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to generate YAML")
		}

		filePath := fmt.Sprintf("/app/flashjobs/flashjob-%s.yaml", req.UUIDs[0][:8])
		if err := os.MkdirAll("/app/flashjobs", 0755); err != nil {
			logger.Printf("Error creating flashjobs directory: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to create flashjobs directory")
		}
		if err := os.WriteFile(filePath, yamlData, 0644); err != nil {
			logger.Printf("Error writing YAML file: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to save YAML file")
		}
		logger.Printf("Saved YAML file to %s", filePath)

		err = k8sService.CreateFlashJob(req.UUIDs, req.Firmware, req.FlashjobPodImage)
		if err != nil {
			logger.Printf("Error creating FlashJob: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to create FlashJob")
		}

		logEntry := models.LogEntry{
			Timestamp: time.Now().Unix(),
			Message:   "FlashJob created with UUIDs: " + stringSliceToString(req.UUIDs) + " and saved to " + filePath,
			Type:      "rollout",
		}
		redisService.LPushList("logs", logEntry)
		redisService.SetExpiration("logs", 48*time.Hour)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":      "FlashJob created successfully",
			"yaml_file":    filePath,
			"yaml_content": string(yamlData),
		})
	}
}

func getFileLogsHandler(logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		logFilePath := "/app/logs/app.log"
		data, err := ioutil.ReadFile(logFilePath)
		if err != nil {
			logger.Printf("Error reading log file: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to read log file")
		}
		logLines := strings.Split(string(data), "\n")
		logger.Printf("Retrieved %d lines from log file", len(logLines))
		return c.JSON(http.StatusOK, map[string][]string{"logs": logLines})
	}
}

func getLogsHandler(redisService *services.RedisService, logger *log.Logger) echo.HandlerFunc {
	return func(c echo.Context) error {
		logs := redisService.LRangeList("logs", 0, -1)
		formattedLogs := make([]map[string]interface{}, len(logs))
		loc, err := time.LoadLocation("Europe/Athens")
		if err != nil {
			logger.Printf("Error loading timezone: %v", err)
			loc = time.UTC
		}
		for i, log := range logs {
			formattedLogs[i] = map[string]interface{}{
				"timestamp":      log.Timestamp,
				"message":        log.Message,
				"type":           log.Type,
				"formatted_time": time.Unix(log.Timestamp, 0).In(loc).Format("2006-01-02 15:04:05"),
			}
		}
		logger.Printf("Retrieved %d Redis logs", len(formattedLogs))
		return c.JSON(http.StatusOK, map[string][]map[string]interface{}{"logs": formattedLogs})
	}
}

func stringSliceToString(slice []string) string {
	return strings.Join(slice, ", ")
}