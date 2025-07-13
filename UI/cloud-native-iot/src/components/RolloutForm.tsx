import React, { useState, useEffect } from 'react';
     import { Form, Button, Alert } from 'react-bootstrap';
     import axios from 'axios';

     interface RolloutFormProps {
       selectedUuids: string[];
       setParentStatus: (message: string | null) => void;
     }

     const RolloutForm: React.FC<RolloutFormProps> = ({ selectedUuids, setParentStatus }) => {
       const [firmware, setFirmware] = useState('');
       const [flashjobPodImage, setFlashjobPodImage] = useState('');
       const [step, setStep] = useState(1);
       const [delay, setDelay] = useState(0);
       const [statusMessage, setStatusMessage] = useState<string | null>(null);

       const handleSubmit = async (e: React.FormEvent) => {
         e.preventDefault();
         const token = localStorage.getItem('token');
         if (!token) {
           const errorMessage = 'No authentication token found';
           setStatusMessage(errorMessage);
           setParentStatus(errorMessage);
           return;
         }
         const data = { uuids: selectedUuids, firmware, flashjobPodImage, step, delay };
         try {
           const response = await axios.post("http://localhost:8000/api/generate-yaml", data, {
             headers: { Authorization: `Bearer ${token}` },
           });
           const message = JSON.stringify(response.data);
           setStatusMessage(message);
           setParentStatus(null);
           await axios.post("http://localhost:8000/api/logs/add", {
             timestamp: Date.now() / 1000,
             message: `Rollout Success: ${message}`,
             type: "success"
           }, {
             headers: { Authorization: `Bearer ${token}` },
           });
           setFirmware('');
           setFlashjobPodImage('');
           setStep(1);
           setDelay(0);
         } catch (error: unknown) {
           const errorMessage = `Error: ${(error as Error).message}`;
           setStatusMessage(errorMessage);
           setParentStatus(errorMessage);
           await axios.post("http://localhost:8000/api/logs/add", {
             timestamp: Date.now() / 1000,
             message: errorMessage,
             type: "error"
           }, {
             headers: { Authorization: `Bearer ${token}` },
           }).catch((err) => console.error("Failed to log error:", err));
           setFirmware('');
           setFlashjobPodImage('');
           setStep(1);
           setDelay(0);
         }
       };

       useEffect(() => {
         let timer: ReturnType<typeof setTimeout>;
         if (statusMessage) {
           timer = setTimeout(() => {
             setStatusMessage(null);
             setParentStatus(null);
           }, 10000);
         }
         return () => {
           if (timer) clearTimeout(timer);
         };
       }, [statusMessage, setParentStatus]);

       return (
         <div>
           <Form onSubmit={handleSubmit}>
             <Form.Group controlId="formFirmware" className="mb-3">
               <Form.Label>Firmware</Form.Label>
               <Form.Control
                 type="text"
                 value={firmware}
                 onChange={(e) => setFirmware(e.target.value)}
                 placeholder="Enter firmware"
               />
             </Form.Group>
             <Form.Group controlId="formFlashjobPodImage" className="mb-3">
               <Form.Label>Flashjob Pod Image</Form.Label>
               <Form.Control
                 type="text"
                 value={flashjobPodImage}
                 onChange={(e) => setFlashjobPodImage(e.target.value)}
                 placeholder="Enter Flashjob Pod Image"
               />
             </Form.Group>
             <Form.Group controlId="formStep" className="mb-3">
               <Form.Label>Step</Form.Label>
               <Form.Control
                 type="number"
                 value={step}
                 onChange={(e) => setStep(parseInt(e.target.value) || 1)}
                 placeholder="Enter step"
               />
             </Form.Group>
             <Form.Group controlId="formDelay" className="mb-3">
               <Form.Label>Delay (seconds)</Form.Label>
               <Form.Control
                 type="number"
                 value={delay}
                 onChange={(e) => setDelay(parseInt(e.target.value) || 0)}
                 placeholder="Enter delay"
               />
             </Form.Group>
             <Button variant="primary" type="submit" disabled={selectedUuids.length === 0}>
               Generate YAML
             </Button>
           </Form>
           {statusMessage && (
             <Alert variant={statusMessage.includes("Error") ? "danger" : "success"} className="mt-3" dismissible onClose={() => { setStatusMessage(null); setParentStatus(null); }}>
               {statusMessage}
             </Alert>
           )}
         </div>
       );
     };

     export default RolloutForm;