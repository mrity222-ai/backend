"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promise_1 = __importDefault(require("mysql2/promise"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- 1. UPLOADS FOLDER SETUP ---
const uploadDir = path_1.default.join(__dirname, '../uploads');
const folders = ['events', 'hero', 'news', 'initiatives', 'gallery'];
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
folders.forEach(folder => {
    const dir = path_1.default.join(uploadDir, folder);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
app.use('/uploads', express_1.default.static(uploadDir));
// --- 2. DATABASE CONNECTION ---
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER, // Hostinger DB Username yahan environment variable se aayega
    password: process.env.DB_PASSWORD, // Hostinger DB Password
    database: process.env.DB_NAME, // Hostinger DB Name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
// --- 3. MULTER SETUP ---
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const fieldMap = {
            'image': 'events', // Matches EventForm
            'hero': 'hero',
            'news': 'news',
            'initiative_img': 'initiatives',
            'gallery': 'gallery'
        };
        const subFolder = fieldMap[file.fieldname] || '';
        cb(null, path_1.default.join(uploadDir, subFolder));
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
    }
});
const upload = (0, multer_1.default)({ storage });
// --- 4. HELPER: IMAGE DELETE ---
const deleteFile = (subFolder, fileName) => {
    if (fileName) {
        const cleanFileName = fileName.split('/').pop();
        if (cleanFileName) {
            const filePath = path_1.default.join(uploadDir, subFolder, cleanFileName);
            if (fs_1.default.existsSync(filePath)) {
                try {
                    fs_1.default.unlinkSync(filePath);
                }
                catch (err) {
                    console.error(`File delete error in ${subFolder}:`, err);
                }
            }
        }
    }
};
// --- 5. LOGIN API ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, message: "Login successful" });
    }
    else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});
// --- 6. API ROUTES ---
app.get('/api/initiatives', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM initiatives ORDER BY display_order ASC');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/initiatives/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM initiatives WHERE id = ?', [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ message: "Initiative not found" });
        res.json(rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/initiatives', upload.single('initiative_img'), async (req, res) => {
    try {
        const { slug, titleHi, titleEn, descriptionHi, descriptionEn, display_order } = req.body;
        const imageName = req.file ? req.file.filename : null;
        await pool.query('INSERT INTO initiatives (slug, titleHi, titleEn, descriptionHi, descriptionEn, image, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [slug, titleHi, titleEn, descriptionHi, descriptionEn, imageName, display_order || 0]);
        res.status(201).json({ message: "Initiative created!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/initiatives/:id', upload.single('initiative_img'), async (req, res) => {
    try {
        const { id } = req.params;
        const { slug, titleHi, titleEn, descriptionHi, descriptionEn, display_order } = req.body;
        const [rows] = await pool.query('SELECT image FROM initiatives WHERE id = ?', [id]);
        if (rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        let imageName = rows[0].image;
        if (req.file) {
            if (imageName)
                deleteFile('initiatives', imageName);
            imageName = req.file.filename;
        }
        await pool.query('UPDATE initiatives SET slug=?, titleHi=?, titleEn=?, descriptionHi=?, descriptionEn=?, image=?, display_order=? WHERE id=?', [slug, titleHi, titleEn, descriptionHi, descriptionEn, imageName, display_order, id]);
        res.json({ message: "Initiative updated!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/initiatives/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT image FROM initiatives WHERE id = ?', [req.params.id]);
        if (rows[0]?.image)
            deleteFile('initiatives', rows[0].image);
        await pool.query('DELETE FROM initiatives WHERE id = ?', [req.params.id]);
        res.json({ message: "Initiative deleted" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- A. EVENTS (UPDATED & MATCHED) ---
// 1. GET ALL
app.get('/api/events', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM events ORDER BY date DESC');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 2. GET SINGLE
app.get('/api/events/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ message: "Event not found" });
        res.json(rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 3. POST (Create)
app.post('/api/events', upload.single('image'), async (req, res) => {
    try {
        const { eventName, location, date, descriptionHi, descriptionEn } = req.body;
        const imageName = req.file ? req.file.filename : null;
        await pool.query('INSERT INTO events (eventName, location, date, descriptionHi, descriptionEn, image) VALUES (?, ?, ?, ?, ?, ?)', [eventName, location, date, descriptionHi, descriptionEn, imageName]);
        res.status(201).json({ message: "Event created!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 4. PUT (Update with Image cleanup)
app.put('/api/events/:id', upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { eventName, location, date, descriptionHi, descriptionEn } = req.body;
        // Pehle purani image ka naam nikaalte hain
        const [rows] = await pool.query('SELECT image FROM events WHERE id = ?', [id]);
        if (rows.length === 0)
            return res.status(404).json({ message: "Event not found" });
        let imageName = rows[0].image;
        // Agar nayi file upload hui hai, toh purani delete karo aur naya naam set karo
        if (req.file) {
            if (imageName)
                deleteFile('events', imageName);
            imageName = req.file.filename;
        }
        const updateQuery = `
            UPDATE events 
            SET eventName=?, location=?, date=?, descriptionHi=?, descriptionEn=?, image=? 
            WHERE id=?
        `;
        await pool.query(updateQuery, [eventName, location, date, descriptionHi, descriptionEn, imageName, id]);
        res.json({ message: "Event updated successfully!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 5. DELETE Event (Added for completeness)
app.delete('/api/events/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT image FROM events WHERE id = ?', [req.params.id]);
        if (rows[0]?.image)
            deleteFile('events', rows[0].image);
        await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
        res.json({ message: "Event deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- B. NEWS (Sahi hai) ---
app.get('/api/news', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/news/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM news WHERE id = ?', [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ message: "News not found" });
        res.json(rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/news', upload.single('news'), async (req, res) => {
    try {
        const { titleEn, titleHi, contentEn, contentHi, category } = req.body;
        const imageName = req.file ? req.file.filename : null;
        await pool.query('INSERT INTO news (titleEn, titleHi, contentEn, contentHi, category, image) VALUES (?, ?, ?, ?, ?, ?)', [titleEn, titleHi, contentEn, contentHi, category || 'General', imageName]);
        res.status(201).json({ message: "News published!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/news/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT image FROM news WHERE id = ?', [req.params.id]);
        if (rows[0]?.image)
            deleteFile('news', rows[0].image);
        await pool.query('DELETE FROM news WHERE id = ?', [req.params.id]);
        res.json({ message: "News deleted" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- C. GALLERY (Sahi hai) ---
app.get('/api/gallery', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM gallery ORDER BY created_at DESC');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/gallery', upload.single('gallery'), async (req, res) => {
    try {
        const { title } = req.body;
        const imageName = req.file ? req.file.filename : null;
        if (!imageName)
            return res.status(400).json({ error: "Image is required" });
        await pool.query('INSERT INTO gallery (title, image) VALUES (?, ?)', [title || 'Untitled', imageName]);
        res.status(201).json({ message: "Image uploaded to gallery!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/gallery/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT image FROM gallery WHERE id = ?', [req.params.id]);
        if (rows[0]?.image)
            deleteFile('gallery', rows[0].image);
        await pool.query('DELETE FROM gallery WHERE id = ?', [req.params.id]);
        res.json({ message: "Image deleted" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- D. HERO SLIDER ---
app.get('/api/hero', async (_req, res) => {
    const [rows] = await pool.query('SELECT * FROM hero_slides ORDER BY display_order ASC');
    res.json(rows);
});
app.post('/api/hero', upload.single('hero'), async (req, res) => {
    try {
        const { subtitle, display_order } = req.body;
        const imageUrl = req.file ? req.file.filename : null;
        await pool.query('INSERT INTO hero_slides (imageUrl, description, display_order) VALUES (?, ?, ?)', [imageUrl, subtitle, display_order]);
        res.status(201).json({ message: 'Hero created' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/hero/:id', upload.single('hero'), async (req, res) => {
    try {
        const { subtitle, display_order } = req.body;
        const id = req.params.id;
        const [rows] = await pool.query('SELECT imageUrl FROM hero_slides WHERE id = ?', [id]);
        if (rows.length === 0)
            return res.status(404).json({ message: 'Hero not found' });
        let imageUrl = rows[0].imageUrl;
        if (req.file) {
            deleteFile('hero', imageUrl);
            imageUrl = req.file.filename;
        }
        await pool.query('UPDATE hero_slides SET imageUrl=?, description=?, display_order=? WHERE id=?', [imageUrl, subtitle, display_order, id]);
        res.json({ message: 'Hero updated' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/hero/:id', async (req, res) => {
    const [rows] = await pool.query('SELECT imageUrl FROM hero_slides WHERE id = ?', [req.params.id]);
    if (rows[0]?.imageUrl)
        deleteFile('hero', rows[0].imageUrl);
    await pool.query('DELETE FROM hero_slides WHERE id = ?', [req.params.id]);
    res.json({ message: 'Hero deleted' });
});
// ... (existing code)
// --- E. MESSAGES (NEWLY ADDED) ---
// 1. GET: Fetch all messages (Admin Portal ke liye)
app.get('/api/messages', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM messages ORDER BY sentAt DESC');
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 2. POST: Save new message (Contact Form se aayega)
app.post('/api/messages', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: "Required fields are missing" });
        }
        await pool.query('INSERT INTO messages (name, email, phone, message) VALUES (?, ?, ?, ?)', [name, email, phone || null, message]);
        res.status(201).json({ success: true, message: "Message sent successfully!" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 3. DELETE: Delete a message (Admin Portal se)
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM messages WHERE id = ?', [id]);
        res.json({ message: "Message deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- SERVER START ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map