package services

import (
	"context"
	"errors"
	"log"
	"strings"

	"github.com/pmavrikos/cloud-native-iot-UI/backend/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

type KubernetesService struct {
	client dynamic.Interface
	logger *log.Logger
}

func NewKubernetesService(client dynamic.Interface, logger *log.Logger) *KubernetesService {
	return &KubernetesService{client: client, logger: logger}
}

func (s *KubernetesService) GetAkriInstances() ([]models.AkriInstance, error) {
	if s.client == nil {
		s.logger.Println("Kubernetes client is nil, returning empty instance list")
		return []models.AkriInstance{}, errors.New("Kubernetes client not initialized")
	}

	gvr := schema.GroupVersionResource{Group: "akri.sh", Version: "v0", Resource: "instances"}
	list, err := s.client.Resource(gvr).Namespace("default").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		s.logger.Printf("Failed to list Akri instances: %v", err)
		return []models.AkriInstance{}, err
	}

	var instances []models.AkriInstance
	for _, item := range list.Items {
		spec, ok := item.Object["spec"].(map[string]interface{})
		if !ok {
			s.logger.Printf("Skipping instance %s: spec is not a map", item.GetName())
			continue
		}
		brokerProps, ok := spec["brokerProperties"].(map[string]interface{})
		if !ok {
			s.logger.Printf("Skipping instance %s: brokerProperties is not a map", item.GetName())
			continue
		}
		metadata, ok := item.Object["metadata"].(map[string]interface{})
		if !ok {
			s.logger.Printf("Skipping instance %s: metadata is not a map", item.GetName())
			continue
		}
		uuid, ok := metadata["uid"].(string)
		if !ok {
			s.logger.Printf("Skipping instance %s: uid is not a string", item.GetName())
			continue
		}
		deviceType, ok := brokerProps["DEVICE"].(string)
		if !ok {
			s.logger.Printf("Skipping instance %s: DEVICE is not a string", item.GetName())
			continue
		}
		applicationType, ok := brokerProps["APPLICATION_TYPE"].(string)
		if !ok {
			s.logger.Printf("Skipping instance %s: APPLICATION_TYPE is not a string", item.GetName())
			continue
		}
		creationTimestamp, ok := metadata["creationTimestamp"].(string)
		if !ok {
			s.logger.Printf("Skipping instance %s: creationTimestamp is not a string", item.GetName())
			continue
		}
		instances = append(instances, models.AkriInstance{
			UUID:           uuid,
			DeviceType:     deviceType,
			ApplicationType: applicationType,
			Status:         "active",
			LastUpdated:    creationTimestamp,
		})
	}
	s.logger.Printf("Retrieved %d Akri instances", len(instances))
	return instances, nil
}

func (s *KubernetesService) FilterInstances(instances []models.AkriInstance, uuid, deviceType, applicationType, status, lastUpdated string) []models.AkriInstance {
	var filtered []models.AkriInstance
	for _, item := range instances {
		if (uuid != "" && uuid != item.UUID) ||
			(deviceType != "" && strings.ToLower(deviceType) != strings.ToLower(item.DeviceType)) ||
			(applicationType != "" && strings.ToLower(applicationType) != strings.ToLower(item.ApplicationType)) ||
			(status != "" && strings.ToLower(status) != strings.ToLower(item.Status)) ||
			(lastUpdated != "" && lastUpdated != item.LastUpdated[:10]) {
			continue
		}
		filtered = append(filtered, item)
	}
	s.logger.Printf("Filtered %d instances from %d total", len(filtered), len(instances))
	return filtered
}

func (s *KubernetesService) CreateFlashJob(uuids []string, firmware, flashjobPodImage string) error {
	if s.client == nil {
		s.logger.Println("Kubernetes client is nil, cannot create FlashJob")
		return errors.New("Kubernetes client not initialized")
	}

	gvr := schema.GroupVersionResource{
		Group:    "application.flashjob.nbfc.io",
		Version:  "v1alpha1",
		Resource: "flashjobs",
	}

	flashjob := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "application.flashjob.nbfc.io/v1alpha1",
			"kind":       "FlashJob",
			"metadata": map[string]interface{}{
				"name":      "flashjob-" + uuids[0][:8],
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"applicationType":  nil,
				"device":          nil,
				"externalIP":      nil,
				"firmware":        firmware,
				"flashjobPodImage": flashjobPodImage,
				"hostEndpoint":    nil,
				"uuid":            uuids,
				"version":         "0.2.0",
			},
		},
	}

	_, err := s.client.Resource(gvr).Namespace("default").Create(context.Background(), flashjob, metav1.CreateOptions{})
	if err != nil {
		s.logger.Printf("Failed to create FlashJob: %v", err)
		// If resource exists, update it
		_, err = s.client.Resource(gvr).Namespace("default").Update(context.Background(), flashjob, metav1.UpdateOptions{})
		if err != nil {
			s.logger.Printf("Failed to update FlashJob: %v", err)
			return err
		}
	}
	s.logger.Printf("Created/Updated FlashJob for UUIDs: %v", uuids)
	return nil
}