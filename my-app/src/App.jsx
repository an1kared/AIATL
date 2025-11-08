import { useState, useRef } from 'react'
import './App.css'
// NOTE: Ensure your CameraCapture component is imported if using camera button
// import { CameraCapture } from './CameraCapture'; 
import { GoogleGenAI } from '@google/genai';

// --- Gemini AI Setup ---
// WARNING: Ensure you have run 'npm install @google/genai'
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Check if the key is available
if (!apiKey) {
  // Use console.error instead of throw new Error to avoid stopping React refresh
  console.error("VITE_GEMINI_API_KEY is not set in .env.local");
}

const ai = new GoogleGenAI({ apiKey });

// Define the desired structured output schema for item name and count
const ingredientSchema = {
  type: "object",
  properties: {
    groceries: {
      type: "array",
      description: "A list of all individual grocery items detected in the image.",
      items: {
        type: "object",
        properties: {
          item_name: {
            type: "string",
            description: "The common name of the detected ingredient or grocery product (e.g., 'Gala Apple', 'Can of Black Beans', 'Dozen Eggs').",
          },
          item_count: {
            type: "number",
            description: "The quantity or count of the specific item detected (e.g., 3 for 3 apples, 1 for 1 box of cereal).",
          },
        },
        required: ["item_name", "item_count"],
      },
    },
  },
  required: ["groceries"],
};
// ------------------------------------------


// --- Mock Data (Kept outside the component) ---
const ingredientLibrary = [
  { id: 'eggs', label: '🥚 Eggs', storage: 'Fridge' },
  { id: 'spinach', label: '🥬 Spinach', storage: 'Fridge' },
  { id: 'tomato', label: '🍅 Tomato', storage: 'Pantry' },
  { id: 'pasta', label: '🍝 Pasta', storage: 'Pantry' },
  { id: 'salmon', label: '🐟 Salmon', storage: 'Fridge' },
  { id: 'yogurt', label: '🥛 Yogurt', storage: 'Fridge' },
  { id: 'avocado', label: '🥑 Avocado', storage: 'Pantry' },
]

const recipes = [
  {
    id: 'salmon-bowl',
    title: 'Omega Boost Salmon Bowl',
    difficulty: 'Easy',
    duration: '20 min',
    nutritionScore: 92,
    summary:
      'Protein-packed bowl with seared salmon, herb quinoa, and a creamy yogurt drizzle.',
    ingredients: ['🐟 Salmon', '🥬 Spinach', '🍅 Tomato', '🥛 Yogurt'],
    videoUrl: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    audioUrl: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  },
  {
    id: 'green-goddess-omelette',
    title: 'Green Goddess Omelette',
    difficulty: 'Medium',
    duration: '15 min',
    nutritionScore: 88,
    summary: 'Fluffy omelette loaded with spinach, avocado crema, and herbs.',
    ingredients: ['🥚 Eggs', '🥬 Spinach', '🥑 Avocado'],
    videoUrl: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    audioUrl: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  },
  {
    id: 'creamy-tomato-pasta',
    title: 'Creamy Tomato Pasta',
    difficulty: 'Easy',
    duration: '25 min',
    nutritionScore: 80,
    summary: 'Silky pasta with a tangy tomato yogurt sauce and wilted greens.',
    ingredients: ['🍝 Pasta', '🍅 Tomato', '🥬 Spinach', '🥛 Yogurt'],
    videoUrl: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
    audioUrl: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  },
]

const inventory = [
  { item: '🥚 Eggs', quantity: '6', storage: 'Fridge', expires: 'Nov 15' },
  { item: '🐟 Salmon filet', quantity: '2', storage: 'Fridge', expires: 'Nov 10' },
  { item: '🍝 Pasta shells', quantity: '1 box', storage: 'Pantry', expires: 'Apr 2026' },
  { item: '🥛 Greek yogurt', quantity: '1 tub', storage: 'Fridge', expires: 'Nov 18' },
]
// --------------------------------------------


// --- The Main App Component ---
function App() {
  // --- State for Data & UI ---
  const [selectedIngredients, setSelectedIngredients] = useState(['eggs', 'spinach', 'salmon']);
  const [focusedRecipe, setFocusedRecipe] = useState(recipes[0]);

  // --- Gemini Detection State ---
  const [detectedResults, setDetectedResults] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  // State for handling different import modes and image data
  const [importMode, setImportMode] = useState(null);
  const [capturedImageBase64, setCapturedImageBase64] = useState(null);

  // Ref for the hidden file input element
  const fileInputRef = useRef(null);

  const toggleIngredient = (id) => {
    setSelectedIngredients((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    )
  }

  // Handler for image data coming from CameraCapture
  const handleImageCapture = (imageBase64) => {
    console.log('Image captured (Base64 header):', imageBase64.substring(0, 50) + '...');
    setCapturedImageBase64(imageBase64);
    setDetectedResults(null);
    setImportMode(null);
  }

  // Handler for file upload from gallery/storage
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();

      reader.onloadend = () => {
        setCapturedImageBase64(reader.result);
        setDetectedResults(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
        setImportMode(null);
      };

      reader.readAsDataURL(file);
    }
  };

  // Helper function to close all import modes
  const handleCloseImport = () => {
    setImportMode(null);
  };

  // --- CORRECTED: Detection Handler using the Base64 state ---
  const detectIngredients = async () => {
    if (!capturedImageBase64) {
      alert("Please capture or upload an image of your groceries first.");
      return;
    }

    if (!apiKey) {
      setDetectionError("API Key not found. Check VITE_GEMINI_API_KEY.");
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    try {
      // Logic to extract Base64 data and MIME type from the data URL string
      const [header, base64Data] = capturedImageBase64.split(',');
      const mimeTypeMatch = header.match(/:(.*?);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      const prompt = "Identify and count every distinct grocery item in the image. Return only the structured JSON requested in the schema.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [imagePart, { text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: ingredientSchema,
        },
      });

      // Gemini returns a string which must be parsed into an object
      const jsonResponse = JSON.parse(response.text);
      setDetectedResults(jsonResponse.groceries);

      console.log("Gemini Detection Successful. Raw Data (Name and Count):", jsonResponse.groceries);

    } catch (err) {
      console.error("Gemini API Error:", err);
      // Display a user-friendly error
      setDetectionError(`API Call Failed. Error: ${err.message || "Unknown error"}`);
    } finally {
      setIsDetecting(false);
    }
  };
  // --------------------------------------------------------


  return (
    <main className="app">
      <header className="hero">
        <div className="hero__badge">Smart Kitchen Agents</div>
        <h1>Your Personal Fridge Companion</h1>
        <p>
          Snap your groceries, classify storage, track inventory, and generate nutrition-forward
          recipes in seconds.
        </p>
        <div className="hero__agents">
          <span>📸 Vision Agent</span>
          <span>🧊 Fridge Agent</span>
          <span>🥗 Recipe Agent</span>
          <span>📊 Nutrition Agent</span>
          <span>🛒 Grocery Agent</span>
        </div>
      </header>

      {/* --- CONTENT START --- */}

      <section className="capture">
        <h2>Import Groceries</h2>

        {/* 🚨 CameraCapture component rendering area (omitted here, assume external implementation) */}
        {/* {importMode === 'camera' && (
          <CameraCapture
            onCapture={handleImageCapture}
            onClose={handleCloseImport}
          />
        )} */}

        <p>Upload or snap a photo for the agents to auto-detect items and routing.</p>

        <div className="capture__actions">

          {/* Hidden File Input Element */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {/* 📸 TAKE PHOTO */}
          <button type="button" onClick={() => setImportMode('camera')}>
            📸 Take Photo
          </button>

          {/* 📂 UPLOAD PHOTO */}
          <button type="button"
            onClick={() => fileInputRef.current.click()}
          >
            📂 Upload Photo
          </button>

          {/* 📝 MANUAL ENTRY */}
          <button type="button" onClick={() => setImportMode('manual')} className="outline">
            📝 Manual Entry
          </button>

          {/* Analyze Button */}
          <button
            type="button"
            className="cta"
            onClick={detectIngredients}
            // Disable if detecting or if no image is loaded
            disabled={isDetecting || !capturedImageBase64} 
            style={{ marginLeft: '10px' }}
          >
            {isDetecting ? '🤖 Detecting...' : '✨ Analyze with Vision Agent'}
          </button>
        </div>

        {/* Display manual entry interface */}
        {importMode === 'manual' && (
          <p className="status-message">Manual entry form goes here...</p>
        )}

        {/* Display a preview of the captured image */}
        {capturedImageBase64 && (
          <div className="capture__image-preview">
            <h3>Image Agent Preview</h3>
            <img
              src={capturedImageBase64}
              alt="Captured Grocery Item"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', marginTop: '15px' }}
            />
          </div>
        )}
        {/* -------------------------------------------------- */}

        <div className="capture__preview">
          <h3>Vision Agent Results</h3>
          {/* Display Status/Error */}
          {detectionError && <p style={{ color: 'red', marginTop: '10px' }}>Error: {detectionError}</p>}
          {isDetecting && <p style={{ marginTop: '10px' }}>Analyzing image, please wait...</p>}

          {capturedImageBase64 && !isDetecting && !detectedResults && !detectionError && (
            <p style={{ marginTop: '10px' }}>Image loaded. Click 'Analyze with Vision Agent' to start.</p>
          )}

          {detectedResults ? (
            <>
              <p>✅ **{detectedResults.length}** items successfully scanned:</p>
              <ul>
                {detectedResults.map((item, index) => (
                  <li key={index}>
                    <span>{item.item_name}</span>
                    <span className="chip">{item.item_count} units</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>A list of detected items will be generated here upon analysis.</p>
          )}

          {/* Original hardcoded list for simulation */}
          <p style={{marginTop: '20px', fontWeight: 'bold'}}>Current Inventory Simulation:</p>
          <ul>
            {ingredientLibrary.map((ingredient) => (
              <li key={ingredient.id}>
                <span>{ingredient.label}</span>
                <span className={ingredient.storage === 'Fridge' ? 'chip fridge' : 'chip pantry'}>
                  {ingredient.storage}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ... (Remaining sections: selector, recipes, inventory, footer) ... */}

    </main>
  )
}

export default App