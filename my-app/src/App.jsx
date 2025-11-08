import { useState, useRef } from 'react' // 👈 Added useRef
import './App.css'
import { GoogleGenAI } from '@google/genai';

// --- Gemini AI Setup (Kept at the top) ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Check if the key is available
if (!apiKey) {
  throw new Error("VITE_GEMINI_API_KEY is not set in .env.local");
}

const ai = new GoogleGenAI({ apiKey });

// Define the desired structured output schema
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


// --- Utility Function (Kept outside the component) ---
// Utility function to convert a File object to a Base64 string for the API
const fileToGenerativePart = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      // The Base64 string is everything after the comma
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type, // e.g., 'image/jpeg'
        },
      });
    };

    reader.onerror = (error) => reject(error);

    // Read the file as a Data URL, which includes the Base64 string
    reader.readAsDataURL(file);
  });
};
// ----------------------------------------------------


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


// --- The Main App Component (Only one definition here) ---
function App() {
  // --- Original Recipe/Inventory State ---
  const [selectedIngredients, setSelectedIngredients] = useState(['eggs', 'spinach', 'salmon']);
  const [focusedRecipe, setFocusedRecipe] = useState(recipes[0]);

  // --- NEW Gemini Detection State ---
  const [detectedFile, setDetectedFile] = useState(null); // The file object
  const [detectedResults, setDetectedResults] = useState(null); // The list of detected items
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  // ----------------------------------

  // State for handling different import modes
  const [importMode, setImportMode] = useState(null); // 'camera', 'file', 'manual', or null
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
    console.log('Image captured:', imageBase64.substring(0, 50) + '...');
    setCapturedImageBase64(imageBase64);
    setImportMode(null); // Close the camera view
  }

  // Handler for file upload from gallery/storage
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();

      reader.onloadend = () => {
        setCapturedImageBase64(reader.result);
        setImportMode(null);
      };

      reader.readAsDataURL(file);
    }
  };

  // Helper function to close all import modes
  const handleCloseImport = () => {
    setImportMode(null);
  };

  // --- NEW: File and Detection Handlers ---
  const handleDetectionFileChange = (e) => {
    setDetectedFile(e.target.files[0]);
    setDetectedResults(null); // Clear previous results
    setDetectionError(null);
  };

  const detectIngredients = async () => {
    if (!detectedFile) {
      alert("Please upload an image of your groceries first.");
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    try {
      const imagePart = await fileToGenerativePart(detectedFile);

      const prompt = "Identify and count every distinct grocery item in the image. Return only the structured JSON requested in the schema.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [imagePart, { text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: ingredientSchema,
        },
      });

      const jsonResponse = JSON.parse(response.text);
      setDetectedResults(jsonResponse.groceries);

      console.log("Gemini Detection Successful. Raw Data (Name and Count):", jsonResponse.groceries);

    } catch (err) {
      console.error("Gemini API Error:", err);
      setDetectionError("Failed to detect ingredients. Check the console for details.");
    } finally {
      setIsDetecting(false);
    }
  };
  // ---------------------------------------


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

      <section className="capture">
        <h2>Import Groceries</h2>

        {/* 🚨 Renders the camera view ONLY when importMode is 'camera' */}
        {importMode === 'camera' && (
          <CameraCapture
            onCapture={handleImageCapture}
            onClose={handleCloseImport}
          />
        )}

        <p>Upload or snap a photo for the agents to auto-detect items and routing.</p>

        {/* --- MODIFIED: Gemini Upload UI integrated here --- */}
        <div className="capture__actions">

          {/* Hidden File Input Element (Necessary for the Upload Photo button) */}
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {/* 📸 TAKE PHOTO: Sets state to 'camera' */}
          <button type="button" onClick={() => setImportMode('camera')}>
            📸 Take Photo
          </button>

          {/* 📂 UPLOAD PHOTO: Clicks the hidden file input */}
          <button type="button"
                  onClick={() => fileInputRef.current.click()}
          >
            📂 Upload Photo
          </button>

          {/* 📝 MANUAL ENTRY: Sets state to 'manual' */}
          <button type="button" onClick={() => setImportMode('manual')} className="outline">
            📝 Manual Entry
          </button>
        </div>

        {/* Display an interface based on the selected mode (e.g., a file input or manual form) */}
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
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}
            />
            <p>Scanning complete. Found 7 items...</p>
          </div>
        )}

        <div className="capture__preview">
          <h3>Vision Agent Results</h3>
          {detectedResults ? (
            <ul>
              {detectedResults ? (
                <p>✅ **{detectedResults.length}** items successfully scanned and classified. (Data stored in `detectedResults` state for icon rendering.)</p>
              ) : (
                <p>A list of detected items will be generated here.</p>
              )}
            </ul>
          ) : (
            <p>A list of detected items will appear here after the Vision Agent analyzes your photo.</p>
          )}

          {/* Original hardcoded list for demonstration/initial state */}
          {/*
          <h3>Auto Classification (Hardcoded Demo)</h3>
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
          */}
        </div>
      </section>

      {/* ... The rest of your App UI remains the same ... */}

      <section className="selector">
        <div className="selector__head">
          <h2>What&apos;s on the menu?</h2>
          <p>Tap to include must-have ingredients. Agents auto-fill the rest.</p>
        </div>
        <div className="chips">
          {ingredientLibrary.map((ingredient) => {
            const active = selectedIngredients.includes(ingredient.id)
            return (
              <button
                type="button"
                key={ingredient.id}
                className={`chip-button ${active ? 'active' : ''}`}
                onClick={() => toggleIngredient(ingredient.id)}
              >
                {ingredient.label}
              </button>
            )
          })}
        </div>
        <button type="button" className="cta">
          Let&apos;s Cook
        </button>
      </section>

      <section className="recipes">
        <div className="recipes__head">
          <h2>Recipe Matches</h2>
          <span>{selectedIngredients.length} key ingredients selected</span>
        </div>
        <div className="recipe-list">
          {recipes.map((recipe) => (
            <article
              key={recipe.id}
              className={`recipe-card ${focusedRecipe.id === recipe.id ? 'focused' : ''}`}
              onClick={() => setFocusedRecipe(recipe)}
            >
              <div className="recipe-card__top">
                <h3>{recipe.title}</h3>
                <span className="score">Nutrition {recipe.nutritionScore}/100</span>
              </div>
              <p className="recipe-card__summary">{recipe.summary}</p>
              <div className="recipe-card__meta">
                <span>⏱ {recipe.duration}</span>
                <span>⭐ {recipe.difficulty}</span>
              </div>
              <div className="recipe-card__ingredients">
                {recipe.ingredients.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {focusedRecipe && (
        <section className="recipe-detail">
          <header>
            <h2>{focusedRecipe.title}</h2>
            <div className="detail__tags">
              <span>⏱ {focusedRecipe.duration}</span>
              <span>⭐ {focusedRecipe.difficulty}</span>
              <span>🥗 Score {focusedRecipe.nutritionScore}/100</span>
            </div>
          </header>
          <p>{focusedRecipe.summary}</p>
          <h3>Ingredients</h3>
          <ul>
            {focusedRecipe.ingredients.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="media">
            <div className="media__block">
              <video controls src={focusedRecipe.videoUrl} />
              <span>AI-generated walkthrough</span>
            </div>
            <div className="media__block">
              <audio controls src={focusedRecipe.audioUrl} />
              <span>Audio brief</span>
            </div>
          </div>
        </section>
      )}

      <section className="inventory">
        <div className="inventory__head">
          <h2>Inventory &amp; Expiry</h2>
          <button type="button" className="outline">
            Sync Grocery Agent
          </button>
        </div>
        <ul>
          {inventory.map((item) => (
            <li key={item.item}>
              <div>
                <strong>{item.item}</strong>
                <span>{item.quantity}</span>
              </div>
              <div className="inventory__meta">
                <span className={item.storage === 'Fridge' ? 'chip fridge' : 'chip pantry'}>
                  {item.storage}
                </span>
                <span className="expiry">Expires {item.expires}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="footer">
        <p>
          Agents are monitoring nutrition, inventory, and grocery lists around the clock. Connect to
          your smart fridge to unlock proactive restock alerts.
        </p>
        <button type="button" className="outline">
          View Agent Activity Log
        </button>
      </footer>
    </main>
  )
}

export default App