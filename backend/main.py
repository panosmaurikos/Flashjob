import yaml
from fastapi import FastAPI, HTTPException, Request, Depends
from kubernetes import client, config
import subprocess
from fastapi.middleware.cors import CORSMiddleware
import time
import os
from typing import List, Optional
import logging
import json
from pydantic import BaseModel
from redis_client import get_redis_client, set_value, lpush_list, lrange_list
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, NoEncryption, BestAvailableEncryption
)
import datetime

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(filename='app.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Global flag for Kubernetes availability
kubernetes_available = True

try:
    redis_client = get_redis_client()
except Exception as e:
    logger.error(f"Failed to initialize Redis client: {e}")
    raise

class LogEntry(BaseModel):
    timestamp: float
    message: str
    type: str = "info"

def load_kube_config_custom():
    global kubernetes_available
    possible_paths = [
        "/root/.kube/k3s.yaml",
        "/root/.kube/config",
        "/etc/rancher/k3s/k3s.yaml"
    ]
    config_loaded = False
    for path in possible_paths:
        logger.debug(f"Checking config file: {path}")
        if os.path.isfile(path):
            try:
                logger.info(f"Attempting to load Kubernetes config from {path}")
                config.load_kube_config(config_file=path)
                v1 = client.CoreV1Api()
                v1.list_node()
                logger.info(f"Successfully loaded and validated config from {path}")
                config_loaded = True
                break
            except Exception as e:
                logger.error(f"Failed to load or validate config from {path}: {str(e)}")
                continue
        else:
            logger.debug(f"Config file not found: {path}")
    if not config_loaded:
        try:
            logger.warning("No local kube-config found. Trying in-cluster config.")
            config.load_incluster_config()
            v1 = client.CoreV1Api()
            v1.list_node()
            logger.info("Successfully loaded and validated in-cluster Kubernetes config.")
        except Exception as e:
            logger.error(f"In-cluster config failed: {str(e)}. Kubernetes features will be disabled.")
            kubernetes_available = False

load_kube_config_custom()

def get_akri_instances():
    if not kubernetes_available:
        logger.warning("Kubernetes features disabled; returning empty list.")
        return {"items": []}
    try:
        api = client.CustomObjectsApi()
        logger.debug("Attempting to list Akri instances...")
        akri_instances = api.list_namespaced_custom_object(
            group="akri.sh",
            version="v0",
            namespace="default",
            plural="instances",
        )
        logger.debug(f"Successfully retrieved Akri instances: {akri_instances}")
        return akri_instances
    except client.rest.ApiException as e:
        logger.error(f"API Exception: {e}")
        raise HTTPException(status_code=500, detail=f"API Error: {e.body}")
    except Exception as e:
        logger.error(f"Unexpected error in get_akri_instances: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def filter_instances(instances, uuid=None, device_type=None, application_type=None, status=None, last_updated=None):
    filtered = []
    for item in instances.get("items", []):
        instance_uuid = item["metadata"]["uid"]
        device = item["spec"]["brokerProperties"].get("DEVICE", "Unknown Device Type")
        app_type = item["spec"]["brokerProperties"].get("APPLICATION_TYPE", "Unknown Application Type")
        item_status = "active"
        update_time = item["metadata"].get("creationTimestamp", "")
        if (uuid and uuid != instance_uuid) or \
           (device_type and device_type.lower() != device.lower()) or \
           (application_type and application_type.lower() != app_type.lower()) or \
           (status and status.lower() != item_status.lower()) or \
           (last_updated and last_updated != update_time[:10]):
            continue
        filtered.append({
            "uuid": instance_uuid,
            "deviceType": device,
            "applicationType": app_type,
            "status": item_status,
            "lastUpdated": update_time
        })
    return filtered

def save_uuids_to_yaml(uuids, firmware, flashjob_pod_image, filename="config/samples/application_v1alpha1_flashjob.yaml"):
    if uuids:
        logger.debug(f"Saving YAML with uuids: {uuids}, firmware: {firmware}, image: {flashjob_pod_image}")
        firmware = firmware.strip() if firmware else ""
        flashjob_pod_image = flashjob_pod_image.strip()
        full_path = os.path.join(BASE_DIR, filename)
        flashjob_data = {
            "apiVersion": "application.flashjob.nbfc.io/v1alpha1",
            "kind": "FlashJob",
            "metadata": {"name": "flashjob", "namespace": "default"},
            "spec": {
                "applicationType": None,
                "device": None,
                "externalIP": None,
                "firmware": firmware,
                "flashjobPodImage": flashjob_pod_image,
                "hostEndpoint": None,
                "uuid": uuids,
                "version": "0.2.0"
            }
        }
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        try:
            with open(full_path, 'w') as file:
                yaml.safe_dump(flashjob_data, file, default_flow_style=False, sort_keys=False)
            logger.debug(f"Successfully saved YAML to {full_path}")
            set_value("latest_yaml", flashjob_data)
            return {"message": f"UUIDs saved to {full_path}"}
        except Exception as e:
            logger.error(f"Failed to save YAML to {full_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save YAML to {full_path}: {e}")
    return {"message": "No UUIDs selected, nothing to save."}

def apply_yaml(filename):
    full_path = os.path.join(BASE_DIR, filename)
    logger.debug(f"Applying YAML file: {full_path}")
    if not os.path.exists(full_path):
        logger.error(f"YAML file not found: {full_path}")
        raise HTTPException(status_code=500, detail=f"YAML file not found: {full_path}")
    try:
        result = subprocess.run(["kubectl", "apply", "-f", full_path], capture_output=True, text=True, check=True)
        logger.debug(f"kubectl apply output: {result.stdout}")
        return {"message": f"Successfully applied {full_path}", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        logger.error(f"kubectl apply failed: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Failed to apply {full_path}: {e.stderr}")
    except Exception as e:
        logger.error(f"Unexpected error in apply_yaml: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def gradual_rollout(uuids, firmware, flashjob_pod_image, step=5, delay=60):
    logger.debug(f"Starting gradual rollout with uuids: {uuids}, step: {step}, delay: {delay}")
    results = []
    save_result = save_uuids_to_yaml(uuids, firmware, flashjob_pod_image)
    for i in range(0, len(uuids), step):
        batch = uuids[i:i + step]
        logger.debug(f"Processing batch {i//step + 1}: {batch}")
        apply_result = apply_yaml("config/samples/application_v1alpha1_flashjob.yaml")
        results.append({"batch": i//step + 1, "uuids": batch, **save_result, **apply_result})
        if i + step < len(uuids):
            logger.debug(f"Sleeping for {delay} seconds")
            time.sleep(delay)
    set_value("rollout_results", results)
    logger.debug(f"Gradual rollout completed with results: {results}")
    return results

@app.post("/logs/add")
async def add_log(log: LogEntry):
    log_entry = {
        "timestamp": log.timestamp,
        "message": log.message,
        "type": log.type
    }
    lpush_list("logs", log_entry)
    redis_client.expire("logs", 172800)
    return {"status": "Log added"}

@app.get("/akri-instances", response_model=dict)
def read_akri_instances():
    akri_data = get_akri_instances()
    set_value("akri_instances", akri_data.get("items", []))
    return {"instances": akri_data.get("items", []) if akri_data else []}

@app.post("/filter-instances", response_model=List[dict])
def filter_akri_instances(filters: dict):
    akri_data = get_akri_instances()
    if not akri_data:
        raise HTTPException(status_code=500, detail="Failed to retrieve Akri instances")
    filtered = filter_instances(akri_data, **filters)
    set_value("filtered_instances", filtered)
    return filtered

@app.post("/generate-yaml", response_model=List[dict])
def generate_yaml(data: dict):
    uuids = data.get("uuids", [])
    firmware = data.get("firmware")
    flashjob_pod_image = data.get("flashjobPodImage", "harbor.nbfc.io/nubificus/iot_esp32-flashjob:local")
    step = data.get("step", 5)
    delay = data.get("delay", 60)

    if not uuids or not firmware:
        raise HTTPException(status_code=400, detail="UUIDs and firmware are required")

    last_uuids = redis_client.get("last_rollout_uuids")
    if last_uuids and json.loads(last_uuids) == uuids:
        return [{"message": "Rollout already performed with same UUIDs"}]

    results = gradual_rollout(uuids, firmware, flashjob_pod_image, step, delay)

    log_entry = {
        "timestamp": time.time(),
        "message": str(results),
        "type": "rollout"
    }
    lpush_list("logs", log_entry)
    redis_client.expire("logs", 172800)
    return results

@app.get("/logs", response_model=dict)
def get_logs():
    logs = lrange_list("logs", 0, -1)
    formatted_logs = [
        {
            "timestamp": log["timestamp"],
            "message": log["message"],
            "type": log.get("type", "info"),
            "formatted_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(log["timestamp"]))
        }
        for log in logs
    ]
    return {"logs": formatted_logs}

@app.get("/logs/filter")
def filter_logs(type: Optional[str] = None, start_time: Optional[float] = None, end_time: Optional[float] = None):
    logs = lrange_list("logs", 0, -1)
    filtered_logs = [
        log for log in logs
        if (not type or log.get("type") == type) and
           (not start_time or log.get("timestamp", 0) >= start_time) and
           (not end_time or log.get("timestamp", 0) <= end_time)
    ]
    formatted_logs = [
        {
            "timestamp": log["timestamp"],
            "message": log["message"],
            "type": log.get("type", "info"),
            "formatted_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(log["timestamp"]))
        }
        for log in filtered_logs
    ]
    return {"logs": formatted_logs}

@app.get("/logs/file")
def get_app_log():
    log_file = os.path.join(BASE_DIR, 'app.log')
    if not os.path.exists(log_file):
        return {"logs": ["No log file found"]}
    try:
        with open(log_file, 'r') as f:
            lines = f.readlines()
        return {"logs": [line.strip() for line in lines[-50:]]}  # Last 50 lines
    except Exception as e:
        logger.error(f"Failed to read app.log: {e}")
        return {"logs": [f"Error reading log file: {e}"]}

@app.get("/check-cert")
async def check_cert(request: Request):
    user_id = request.headers.get("X-User-ID", request.client.host)  # Use header or IP as user ID
    cert_key = f"user_cert_{user_id}"
    if redis_client.exists(cert_key):
        return {"has_cert": True}
    return {"has_cert": False}

@app.post("/generate-certificate")
async def generate_certificate(request: Request):
    user_id = request.headers.get("X-User-ID", request.client.host)
    cert_key = f"user_cert_{user_id}"
    if redis_client.exists(cert_key):
        raise HTTPException(status_code=400, detail="Certificate already exists for this user")

    # Generate private key and certificate
    private_key = ec.generate_private_key(ec.SECP384R1())
    subject = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "MyApp"),
        x509.NameAttribute(NameOID.COMMON_NAME, f"user_{user_id}")
    ])
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)  # Self-signed
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=730))  # 2 years
        .serial_number(x509.random_serial_number())
        .public_key(private_key.public_key())
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True), critical=True)
        .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
    )
    certificate = builder.sign(private_key, hashes.SHA384())

    # Save CRT for server (simulating trust addition)
    cert_path = os.path.join(BASE_DIR, f"{cert_key}.crt")
    with open(cert_path, "wb") as f:
        f.write(certificate.public_bytes(Encoding.PEM))

    # Generate PFX for browser
    pfx_data = (
        x509.PKCS12CertificateBuilder()
        .add_certificate(certificate)
        .add_key(private_key, None)  # No encryption for simplicity
        .build()
        .public_bytes(Encoding.DER)
    )
    pfx_path = os.path.join(BASE_DIR, f"{cert_key}.pfx")
    with open(pfx_path, "wb") as f:
        f.write(pfx_data)

    # Simulate adding to trust (adjust as per your Kubernetes setup)
    subprocess.run(["kubectl", "apply", "-f", cert_path], capture_output=True, text=True, check=True)
    redis_client.set(cert_key, "true")
    redis_client.expire(cert_key, 172800)  # 48 hours expiration

    # Return PFX for browser installation
    with open(pfx_path, "rb") as f:
        return {"message": "Certificate generated", "pfx": f.read().decode('latin1')}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile="certs/server.key", ssl_certfile="certs/server.crt")