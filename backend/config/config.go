package config

import (
	"os"
	"strconv"
)

type Config struct {
	ServerAddr     string
	RedisHost      string
	RedisPort      int
	RedisDB        int
	KubeConfigPath string
	JWTSecret      string
}

func LoadConfig() Config {
	return Config{
		ServerAddr:     getEnv("SERVER_ADDR", "0.0.0.0:8000"),
		RedisHost:      getEnv("REDIS_HOST", "localhost"),
		RedisPort:      getEnvAsInt("REDIS_PORT", 6379),
		RedisDB:        getEnvAsInt("REDIS_DB", 0),
		KubeConfigPath: getEnv("KUBE_CONFIG_PATH", "/root/.kube/config"),
		JWTSecret:      getEnv("JWT_SECRET", "mysecretkey"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
