package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/pmavrikos/cloud-native-iot-UI/backend/models"
	"github.com/redis/go-redis/v9"
)

type RedisService struct {
	client *redis.Client
	logger *log.Logger
}

func NewRedisClient(host string, port int, db int) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", host, port),
		Password: "",
		DB:       db,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for i := 0; i < 5; i++ {
		err := client.Ping(ctx).Err()
		if err == nil {
			return client, nil
		}
		log.Printf("Failed to connect to Redis (attempt %d): %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("failed to connect to Redis after 5 attempts")
}

func NewRedisService(client *redis.Client, logger *log.Logger) *RedisService {
	return &RedisService{client: client, logger: logger}
}

func (s *RedisService) SetValue(key string, value interface{}) {
	data, err := json.Marshal(value)
	if err != nil {
		s.logger.Printf("Error marshaling value for Redis: %v", err)
		return
	}
	err = s.client.Set(context.Background(), key, data, 0).Err()
	if err != nil {
		s.logger.Printf("Error setting value in Redis: %v", err)
	}
}

func (s *RedisService) LPushList(key string, value interface{}) {
	data, err := json.Marshal(value)
	if err != nil {
		s.logger.Printf("Error marshaling value for Redis list: %v", err)
		return
	}
	err = s.client.LPush(context.Background(), key, data).Err()
	if err != nil {
		s.logger.Printf("Error pushing to Redis list: %v", err)
	}
}

func (s *RedisService) LRangeList(key string, start, stop int64) []models.LogEntry {
	items, err := s.client.LRange(context.Background(), key, start, stop).Result()
	if err != nil {
		s.logger.Printf("Error getting range from Redis list: %v", err)
		return []models.LogEntry{}
	}
	var logs []models.LogEntry
	for _, item := range items {
		var logEntry models.LogEntry
		if err := json.Unmarshal([]byte(item), &logEntry); err == nil {
			logs = append(logs, logEntry)
		}
	}
	return logs
}

func (s *RedisService) SetExpiration(key string, duration time.Duration) {
	err := s.client.Expire(context.Background(), key, duration).Err()
	if err != nil {
		s.logger.Printf("Error setting expiration in Redis: %v", err)
	}
}