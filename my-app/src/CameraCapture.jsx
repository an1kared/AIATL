import React, { useRef, useCallback, useState } from 'react';
import Webcam from 'react-webcam';

// Constraint to prioritize the environment (back) camera on mobile
const videoConstraints = {
  facingMode: { ideal: "environment" }, 
};

export function CameraCapture({ onCapture, onClose }) {
  const webcamRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(null);

  // Function to capture the image
  const capture = useCallback(() => {
    // getScreenshot() returns a base64 encoded image string
    const imageBase64 = webcamRef.current.getScreenshot(); 
    setImgSrc(imageBase64);
  }, [webcamRef]);

  // Function to confirm and pass the captured image back to the parent
  const handleConfirm = () => {
    if (imgSrc) {
      onCapture(imgSrc); 
      // onClose() is now called inside the parent's handleImageCapture, but good practice to keep it here too if needed
    }
  };

  return (
    <div className="camera-modal">
      <div className="camera-content">
        {/* Conditional rendering: Show Image Preview OR Live Webcam Feed */}
        {imgSrc ? (
          <img src={imgSrc} alt="Captured Photo" style={{ width: '100%' }} />
        ) : (
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            videoConstraints={videoConstraints}
            className="webcam-live" 
          />
        )}
      </div>

      <div className="camera-controls">
        {imgSrc ? (
          // After capture: Confirm or Retake
          <>
            <button onClick={handleConfirm} className="cta">Confirm Use</button>
            <button onClick={() => setImgSrc(null)} className="outline">Retake</button>
          </>
        ) : (
          // Live feed: Capture or Close
          <>
            <button onClick={capture} className="cta">📸 Take Photo</button>
            <button onClick={onClose} className="outline">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}