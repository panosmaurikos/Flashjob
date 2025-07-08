package main

import (
	"log"
	"os"
	"path/filepath"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/pmavrikos/cloud-native-iot-UI/backend/api"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/auth"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/config"
	"github.com/pmavrikos/cloud-native-iot-UI/backend/services"
)

func main() {
	// Load configuration
	cfg := config.LoadConfig()

	// Initialize logger
	logger := log.New(os.Stdout, "INFO: ", log.Ldate|log.Ltime|log.Lshortfile)
	logDir := "/app/logs"
	if err := os.MkdirAll(logDir, 0755); err != nil {
		logger.Fatal("Failed to create log directory:", err)
	}
	logFile, err := os.OpenFile(filepath.Join(logDir, "app.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		logger.Fatal("Failed to open log file:", err)
	}
	defer logFile.Close()
	logger.SetOutput(logFile)

	// Initialize Redis client
	redisClient, err := services.NewRedisClient(cfg.RedisHost, cfg.RedisPort, cfg.RedisDB)
	if err != nil {
		logger.Fatal("Failed to initialize Redis client:", err)
	}

	// Initialize auth service
	err = auth.InitializeDB(redisClient)
	if err != nil {
		logger.Fatal("Failed to initialize auth database:", err)
	}

	// Initialize Kubernetes client
	var k8sClient dynamic.Interface
	apiServerOverride := os.Getenv("KUBERNETES_API_SERVER")
	kubeConfigPath := os.Getenv("KUBE_CONFIG_PATH")
	
	if kubeConfigPath == "" {
		logger.Println("KUBE_CONFIG_PATH not set, trying KUBECONFIG or default ~/.kube/config")
		kubeConfigPath = os.Getenv("KUBECONFIG")
		if kubeConfigPath == "" {
			homeDir, _ := os.UserHomeDir()
			kubeConfigPath = filepath.Join(homeDir, ".kube", "config")
			logger.Printf("KUBECONFIG not set, trying default: %s", kubeConfigPath)
		} else {
			logger.Printf("Trying kubeconfig from KUBECONFIG: %s", kubeConfigPath)
		}
	} else {
		logger.Printf("Trying kubeconfig from KUBE_CONFIG_PATH: %s", kubeConfigPath)
	}

	// Check if kubeconfig file exists and is not a directory
	fileInfo, err := os.Stat(kubeConfigPath)
	if err != nil || fileInfo.IsDir() {
		logger.Printf("Kubeconfig not available: %v", err)
	} else {
		logger.Printf("Loading kubeconfig from %s", kubeConfigPath)
		
		
		config, err := clientcmd.LoadFromFile(kubeConfigPath)
		if err != nil {
			logger.Printf("Error loading kubeconfig: %v", err)
		} else {
			
			if apiServerOverride != "" {
				for _, cluster := range config.Clusters {
					cluster.Server = apiServerOverride
				}
				logger.Printf("Overriding Kubernetes API server to: %s", apiServerOverride)
			}
			
			
			clientConfig := clientcmd.NewDefaultClientConfig(*config, &clientcmd.ConfigOverrides{})
			k8sConfig, err := clientConfig.ClientConfig()
			if err != nil {
				logger.Printf("Error creating client config: %v", err)
			} else {
				
				insecure, _ := strconv.ParseBool(os.Getenv("KUBERNETES_INSECURE"))
				if insecure {
					logger.Println("Skipping TLS verification for Kubernetes API")
					k8sConfig.TLSClientConfig.Insecure = true
					k8sConfig.TLSClientConfig.CAData = nil
					k8sConfig.TLSClientConfig.CAFile = ""
				}
				
				k8sClient, err = dynamic.NewForConfig(k8sConfig)
				if err != nil {
					logger.Printf("Failed to create Kubernetes client: %v", err)
				} else {
					logger.Println("Kubernetes client initialized successfully")
				}
			}
		}
	}

	// Fallback to in-cluster config if kubeconfig fails
	if k8sClient == nil {
		logger.Println("Falling back to in-cluster config")
		k8sConfig, err := rest.InClusterConfig()
		if err != nil {
			logger.Printf("In-cluster config failed: %v", err)
		} else {
			k8sClient, err = dynamic.NewForConfig(k8sConfig)
			if err != nil {
				logger.Printf("Failed to create in-cluster client: %v", err)
			} else {
				logger.Println("Kubernetes client initialized with in-cluster config")
			}
		}
	}

	// Set up Echo server
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"http://0.0.0.0:5173"},
		AllowCredentials: true,
		AllowMethods:     []string{echo.GET, echo.POST, echo.PUT, echo.DELETE},
		AllowHeaders:     []string{echo.HeaderAuthorization, echo.HeaderContentType},
	}))

	// Healthcheck endpoint
	e.GET("/health", func(c echo.Context) error {
		status := "healthy"
		if k8sClient == nil {
			status = "degraded (no k8s connection)"
		}
		return c.JSON(200, map[string]string{"status": status})
	})

	// Initialize services
	authService := auth.NewAuthService(redisClient, cfg.JWTSecret)
	k8sService := services.NewKubernetesService(k8sClient, logger)
	redisService := services.NewRedisService(redisClient, logger)

	// Register routes
	api.RegisterRoutes(e, authService, k8sService, redisService, logger)

	// Start server
	logger.Printf("Starting server on %s", cfg.ServerAddr)
	e.Logger.Fatal(e.Start(cfg.ServerAddr))
}
