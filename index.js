const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini Pro with API key from environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/generate-policy', async (req, res) => {
    try {
        const { service, prompt } = req.body;

        // Input validation
        if (!service || !prompt) {
            return res.status(400).json({
                success: false,
                error: 'Service and prompt are required'
            });
        }

        const systemPrompt = `Create an AWS ${service} policy for the following requirement: "${prompt}"
        Important: Respond ONLY with a valid JSON policy document. Do not include any markdown formatting, code blocks, or explanatory text.
        The response should start with { and end with } and be a valid AWS IAM policy document.`;

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        let text = response.text();
        
        // Clean up the response
        text = text.replace(/```json/g, '')
                  .replace(/```/g, '')
                  .replace(/^[\s\n]+|[\s\n]+$/g, '');
        
        if (!text.startsWith('{')) {
            text = text.substring(text.indexOf('{'));
        }
        if (!text.endsWith('}')) {
            text = text.substring(0, text.lastIndexOf('}') + 1);
        }

        try {
            const policy = JSON.parse(text);
            res.json({ success: true, policy });
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.log('Attempted to parse:', text);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to generate valid policy JSON. Please try rephrasing your request.' 
            });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate policy. Please ensure your prompt is clear and try again.' 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong! Please try again later.'
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
