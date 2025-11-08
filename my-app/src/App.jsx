import { useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import './App.css';
import { CameraCapture } from './CameraCapture'; // Assuming CameraCapture is available
import {GoogleGenAI} from '@google/genai';

// --- Gemini AI Setup ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Check if the key is available
if (!apiKey) {
  // Use console.error instead of throw new Error to avoid stopping React refresh
  console.error("VITE_GEMINI_API_KEY is not set in .env.local");
}

const ai = new GoogleGenAI({ apiKey });

// Define the desired structured output schema for item name and count
const ingredientSchema = {
  type: 'object',
  properties: {
    groceries: {
      type: 'array',
      description: 'A list of all individual grocery items detected in the image.',
      items: {
        type: 'object',
        properties: {
          item_name: {
            type: 'string',
            description:
              "The common name of the detected ingredient or grocery product (e.g., 'Gala Apple', 'Can of Black Beans', 'Dozen Eggs').",
          },
          item_count: {
            type: 'number',
            description:
              'The quantity or count of the specific item detected (e.g., 3 for 3 apples, 1 for 1 box of cereal).',
          },
          storage_location: {
            type: 'string',
            enum: ['Fridge', 'Pantry'],
            description:
              "Where the item should be stored. Return only 'Fridge' for refrigerated/frozen goods or 'Pantry' for shelf-stable items.",
          },
        },
        required: ['item_name', 'item_count', 'storage_location'],
      },
    },
  },
  required: ['groceries'],
}
// ------------------------------------------


// --- CONSTANTS (DUMMY DATA) ---
const ingredientLibrary = [
  { id: 'eggs', label: '🥚 Eggs', storage: 'Fridge' },
  { id: 'spinach', label: '🥬 Spinach', storage: 'Fridge' },
  { id: 'tomato', label: '🍅 Tomato', storage: 'Pantry' },
  { id: 'pasta', label: '🍝 Pasta', storage: 'Pantry' },
  { id: 'salmon', label: '🐟 Salmon', storage: 'Fridge' },
  { id: 'yogurt', label: '🥛 Yogurt', storage: 'Fridge' },
  { id: 'avocado', label: '🥑 Avocado', storage: 'Pantry' },
];

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
];

const inventory = [
  { item: '🥚 Eggs', quantity: '6', storage: 'Fridge', expires: 'Nov 15' },
  { item: '🐟 Salmon filet', quantity: '2', storage: 'Fridge', expires: 'Nov 10' },
  { item: '🍝 Pasta shells', quantity: '1 box', storage: 'Pantry', expires: 'Apr 2026' },
  { item: '🥛 Greek yogurt', quantity: '1 tub', storage: 'Fridge', expires: 'Nov 18' },
];
// ------------------------------------------------


// --- PAGE COMPONENTS ---

function CapturePage({ 
    handleImageCapture, handleCloseImport, capturedImageBase64, 
    importMode, setImportMode, fileInputRef, handleFileUpload, ingredientLibrary,
    // PASSED GEMINI PROPS:
    detectIngredients, detectedResults, isDetecting, detectionError,
    // PREFERENCE PROPS:
    preference, setPreference
}) {
  return (
    <>
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
            {/* Preference Input */}
            <section className="preference" style={{ padding: '1rem 0' }}>
              <h2 style={{ marginBottom: 8 }}>What do you feel like making?</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                  placeholder="e.g., high-protein pasta, vegan tacos, quick breakfast"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    minWidth: 260,
                    flex: '1 1 260px',
                  }}
                />
                <Link to="/recipes" className="cta" style={{ textDecoration: 'none' }}>
                  Find Recipes
                </Link>
              </div>
            </section>
            <section className="capture">
                <h2>Import Groceries</h2>
                {importMode === 'camera' && (
                    <CameraCapture onCapture={handleImageCapture} onClose={handleCloseImport} />
                )}
                <p>Upload or snap a photo for the agents to auto-detect items and routing.</p>
                <div className="capture__actions">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                    <button type="button" onClick={() => setImportMode('camera')}>📸 Take Photo</button>
                    <button type="button" onClick={() => fileInputRef.current.click()}>📂 Upload Photo</button>
                    <button type="button" onClick={() => setImportMode('manual')} className="outline">📝 Manual Entry</button>
                    
                    {/* Analyze Button (Now uses prop) */}
                    <button
                      type="button"
                      className="cta"
                      onClick={detectIngredients}
                      disabled={isDetecting || !capturedImageBase64}
                      style={{ marginLeft: '10px' }}
                    >
                      {isDetecting ? '🤖 Detecting...' : '✨ Analyze with Vision Agent'}
        </button>

                </div>
                {importMode === 'manual' && (
                    <p className="status-message">Manual entry form goes here...</p>
                )}
                {capturedImageBase64 && (
                    <div className="capture__image-preview">
                        <h3>Image Agent Preview</h3>
                        <img src={capturedImageBase64} alt="Captured Grocery Item" style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}/>
                    </div>
                )}
                <div className="capture__preview">
                    <h3>Vision Agent Results</h3>
                    {/* Display Status/Error */}
                    {detectionError && <p style={{ color: 'red', marginTop: '10px' }}>Error: {detectionError}</p>}
                    {isDetecting && <p style={{ marginTop: '10px' }}>Analyzing image, please wait...</p>}

                    {capturedImageBase64 && !isDetecting && !detectedResults && !detectionError && (
                      <p style={{ marginTop: '10px' }}>Image loaded. Click 'Analyze with Vision Agent' to start analysis.</p>
                    )}

                    {detectedResults ? (
                        <>
                            <p>
                              📅 Captured on{' '}
                              <strong>
                                {detectedResults.captured_date
                                  ? new Date(detectedResults.captured_date).toLocaleString(undefined, {
                                      dateStyle: 'medium',
                                      timeStyle: 'short',
                                    })
                                  : 'Unknown time'}
                              </strong>
                            </p>
                            <p>
                              ✅ <strong>{detectedResults.groceries.length}</strong> items successfully categorized:
                            </p>
                            <ul>
                                {detectedResults.groceries.map((item, index) => (
                                    <li key={index}>
                                        <span>{item.item_name}</span>
                                        <span className="chip">{item.item_count} units</span>
                                        <span
                                          className={`chip ${
                                            item.storage_location === 'Fridge' ? 'fridge' : 'pantry'
                                          }`}
                                        >
                                          {item.storage_location}
                                        </span>
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
        </>
    );
}

function InventoryPage({ inventory }) {
    return (
        <section className="inventory">
            <div className="inventory__head">
                <h2>Inventory &amp; Expiry</h2>
                <button type="button" className="outline">Sync Grocery Agent</button>
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
    );
}

function RecipesPage({ selectedIngredients, toggleIngredient, ingredientLibrary, recipes, preference }) {
    return (
        <>
            <section className="selector">
                <div className="selector__head">
                    <h2>What&apos;s on the menu?</h2>
                    <p>Tap to include must-have ingredients. Agents auto-fill the rest.</p>
                    {preference && (
                      <p style={{ marginTop: 6 }}>
                        <strong>Preference:</strong> {preference}
                      </p>
                    )}
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
                <button type="button" className="cta">Let&apos;s Cook</button>
            </section>

            <section className="recipes">
                <div className="recipes__head">
                    <h2>Recipe Matches</h2>
                    <span>{selectedIngredients.length} key ingredients selected</span>
                </div>
                <div className="recipe-list">
                    {recipes.map((recipe) => (
                        <Link 
                            to={`/recipes/${recipe.id}`} 
                            key={recipe.id}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <article
                                className="recipe-card"
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
                        </Link>
                    ))}
      </div>
            </section>
        </>
    );
}

function RecipeDetailPage({ recipes }) {
    // Uses the URL parameter to find the specific recipe
    const { recipeId } = useParams(); 
    const recipe = recipes.find(r => r.id === recipeId);

    if (!recipe) {
        return <section className="recipe-detail"><h2>Recipe Not Found</h2></section>;
    }

    return (
        <section className="recipe-detail">
            <Link to="/recipes" className="back-button">← Back to Recipes</Link>
            
            <header>
                <h2>{recipe.title}</h2>
                <div className="detail__tags">
                    <span>⏱ {recipe.duration}</span>
                    <span>⭐ {recipe.difficulty}</span>
                    <span>🥗 Score {recipe.nutritionScore}/100</span>
                </div>
            </header>
            <p>{recipe.summary}</p>
            <h3>Ingredients</h3>
            <ul>
                {recipe.ingredients.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
            <div className="media">
                <div className="media__block">
                    <video controls src={recipe.videoUrl} />
                    <span>AI-generated walkthrough</span>
                </div>
                <div className="media__block">
                    <audio controls src={recipe.audioUrl} />
                    <span>Audio brief</span>
                </div>
            </div>
        </section>
    );
}


// --- MAIN APP COMPONENT ---

function App() {
  // Shared State and Refs
  const [selectedIngredients, setSelectedIngredients] = useState(['eggs', 'spinach', 'salmon'])
  const [preference, setPreference] = useState('')
  const [importMode, setImportMode] = useState(null)
  const [capturedImageBase64, setCapturedImageBase64] = useState(null)
  const [captureTimestamp, setCaptureTimestamp] = useState(null)
  const fileInputRef = useRef(null)

  // Gemini Detection State
  const [detectedResults, setDetectedResults] = useState(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState(null)


  // Handler Functions
  const toggleIngredient = (id) => {
    setSelectedIngredients((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    )
  }
  
  const handleImageCapture = (imageBase64) => {
    setCapturedImageBase64(imageBase64)
    setDetectedResults(null) // Clear previous results on new image
    setCaptureTimestamp(new Date().toISOString())
    setImportMode(null)
  }

  const handleCloseImport = () => {
    setImportMode(null);
  };
  
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImageBase64(reader.result)
        setDetectedResults(null) // Clear previous results on new image
        setCaptureTimestamp(new Date().toISOString())
        if (fileInputRef.current) fileInputRef.current.value = null
        setImportMode(null)
      };
      reader.readAsDataURL(file);
    }
  };

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


      const prompt =
        'Identify every distinct grocery item in the photo, count how many of each you see, and determine whether each belongs in the fridge (cold/frozen goods) or pantry (shelf-stable/dry goods). Return only the structured JSON that matches the provided schema.'


      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [imagePart, { text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: ingredientSchema,
        },
      });


      const jsonResponse = JSON.parse(response.text)
      const capturedDate = captureTimestamp || new Date().toISOString()
      const payload = {
        captured_date: capturedDate,
        groceries: jsonResponse.groceries || [],
      }
      setDetectedResults(payload)

      console.log('Gemini Detection Successful. Payload:', payload)


    } catch (err) {
      console.error("Gemini API Error:", err);
      setDetectionError(`API Call Failed. Error: ${err.message || "Unknown error"}`);
    } finally {
      setIsDetecting(false);
    }
  };


  return (
    <BrowserRouter>
      <main className="app">
        
        {/* Navigation Menu */}
        <nav className="bottom-nav">
          <Link to="/">📸 Capture</Link>
          <Link to="/recipes">🥗 Recipes</Link>
          <Link to="/inventory">🧊 Inventory</Link>
        </nav>
        
        {/* Define the Routes, passing state and handlers as props */}
        <Routes>
          {/* Capture/Home Page */}
          <Route 
            path="/" 
            element={
              <CapturePage 
                handleImageCapture={handleImageCapture} 
                handleCloseImport={handleCloseImport}
                capturedImageBase64={capturedImageBase64}
                importMode={importMode}
                setImportMode={setImportMode}
                fileInputRef={fileInputRef}
                handleFileUpload={handleFileUpload}
                ingredientLibrary={ingredientLibrary}
                
                // PASS GEMINI PROPS:
                detectedResults={detectedResults}
                isDetecting={isDetecting}
                detectionError={detectionError}
                detectIngredients={detectIngredients}
                
                // Preference
                preference={preference}
                setPreference={setPreference}
              />
            } 
          />
          {/* Recipe List Page */}
          <Route 
            path="/recipes" 
            element={
              <RecipesPage 
                selectedIngredients={selectedIngredients}
                toggleIngredient={toggleIngredient}
                ingredientLibrary={ingredientLibrary}
                recipes={recipes}
                preference={preference}
              />
            } 
          />
          {/* Dynamic Recipe Detail Page (uses ID from URL) */}
          <Route 
            path="/recipes/:recipeId" 
            element={<RecipeDetailPage recipes={recipes} />} 
          />
          {/* Inventory Page */}
          <Route 
            path="/inventory" 
            element={<InventoryPage inventory={inventory} />} 
          />
        </Routes>
        
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
    </BrowserRouter>
  );
}

export default App;