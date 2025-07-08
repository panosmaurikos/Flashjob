FROM golang:1.24.3-alpine AS builder

WORKDIR /app
COPY . .
RUN go mod init github.com/pmavrikos/cloud-native-iot-UI/backend || true
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o backend main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/backend .
COPY --from=builder /app/logs ./logs
RUN mkdir -p /app/flashjobs
EXPOSE 8000
CMD ["./backend"]