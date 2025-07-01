#!/bin/bash

echo "Checking if Redis is installed..."
if ! command -v redis-server &> /dev/null
then
    echo "Redis is not installed. Installing now..."
    sudo apt update
    sudo apt install -y redis-server
    echo "Redis installed successfully."
else
    echo "Redis is already installed."
fi

# Start Redis server (optional)
echo "Starting Redis server..."
sudo systemctl start redis-server
chmod +x cloud-native-iot-UI/backend/run.sh
pip install -r requirements.txt
echo "Starting FastAPI app..."
uvicorn main:app --host 0.0.0.0 --port 8000
