package models

type AkriInstance struct {
	UUID           string `json:"uuid"`
	DeviceType     string `json:"deviceType"`
	ApplicationType string `json:"applicationType"`
	Status         string `json:"status"`
	LastUpdated    string `json:"lastUpdated"`
}

type LogEntry struct {
	Timestamp int64  `json:"timestamp"`
	Message   string `json:"message"`
	Type      string `json:"type"`
}