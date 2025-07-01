import redis
import os
import json
import time
from typing import Any, Optional
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")  
#REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

# Initialize Redis client with retry logic
def get_redis_client(max_retries: int = 5, delay: int = 2) -> redis.Redis:
    for attempt in range(max_retries):
        try:
            client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                decode_responses=True
            )
            # Test the connection
            client.ping()
            print(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
            return client
        except redis.ConnectionError as e:
            print(f"Attempt {attempt + 1} failed to connect to Redis: {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
            else:
                raise Exception(f"Failed to connect to Redis after {max_retries} attempts: {e}")

redis_client = get_redis_client()

def set_value(key: str, value: Any) -> bool:
    try:
        redis_client.set(key, json.dumps(value) if isinstance(value, (dict, list)) else value)
        return True
    except Exception as e:
        print(f"Error setting value in Redis: {e}")
        return False

def get_value(key: str) -> Optional[Any]:
    try:
        value = redis_client.get(key)
        return json.loads(value) if value and (value.startswith("{") or value.startswith("[")) else value
    except Exception as e:
        print(f"Error getting value from Redis: {e}")
        return None

def lpush_list(key: str, value: Any) -> int:
    try:
        return redis_client.lpush(key, json.dumps(value) if isinstance(value, (dict, list)) else value)
    except Exception as e:
        print(f"Error pushing to Redis list: {e}")
        return 0

def lrange_list(key: str, start: int, end: int) -> list:
    try:
        return [json.loads(item) if item.startswith("{") or item.startswith("[") else item for item in redis_client.lrange(key, start, end)]
    except Exception as e:
        print(f"Error getting range from Redis list: {e}")
        return []