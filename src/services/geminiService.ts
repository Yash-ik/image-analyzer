import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export interface ArtifactDetail {
  label: string;
  description: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized to 1000
}

export interface AnalysisResult {
  isAI: "Likely" | "Unlikely" | "Inconclusive";
  confidence: number;
  reasoning: string;
  description: string;
  artifacts: string[];
  artifactDetails?: ArtifactDetail[];
  technicalMetadata: {
    estimatedResolution?: string;
    style?: string;
    lighting?: string;
    composition?: string;
  };
  colorPalette: {
    hex: string;
    label: string;
  }[];
}

export async function analyzeImage(base64Image: string, mimeType: string): Promise<AnalysisResult> {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    You are a professional digital forensics expert specializing in AI image detection. 
    Analyze the provided image with extreme scrutiny to determine if it is AI-generated or an authentic photograph/human-made artwork.

    ### ANALYSIS PROTOCOL:
    1.  **Anatomical Check**: Examine hands, eyes, teeth, and limb junctions. Look for merged digits, inconsistent eye reflections, or impossible joints.
    2.  **Texture & Noise**: Check for "AI smoothing" (plastic skin), unnatural noise patterns, or "melting" textures in complex areas like hair, fur, or fabric.
    3.  **Environmental Consistency**: Look for background elements that don't make sense (e.g., windows that don't align, objects merging into walls, garbled text on signs).
    4.  **Lighting & Physics**: Analyze shadows and reflections. Are they physically consistent with the light sources? Look for "floating" objects or missing contact shadows.
    5.  **Edge Analysis**: Check the boundaries between objects. AI often struggles with clean edges, leading to "halos" or weird blending.
    6.  **Semantic Logic**: Does the scene make sense? Look for nonsensical objects or impossible geometry.

    ### OUTPUT REQUIREMENTS:
    - **isAI**: 
      - "Likely" if clear synthetic markers are found.
      - "Unlikely" if the image shows high-frequency photographic detail and consistent physics.
      - "Inconclusive" if the image is low-resolution, heavily filtered, or ambiguous.
    - **confidence**: A percentage (0-100) reflecting your certainty.
    - **reasoning**: A technical, forensic explanation of your findings. Mention specific "tells".
    - **artifactDetails**: Provide precise bounding boxes [ymin, xmin, ymax, xmax] (0-1000) for every detected anomaly.

    Return your analysis in strict JSON format:
    {
      "isAI": "Likely" | "Unlikely" | "Inconclusive",
      "confidence": number,
      "reasoning": "string",
      "description": "string",
      "artifacts": ["string"],
      "artifactDetails": [
        {
          "label": "string",
          "description": "string",
          "box_2d": [number, number, number, number]
        }
      ],
      "technicalMetadata": {
        "estimatedResolution": "string",
        "style": "string",
        "lighting": "string",
        "composition": "string"
      },
      "colorPalette": [
        { "hex": "#RRGGBB", "label": "string" }
      ]
    }
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image.split(",")[1] || base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}
