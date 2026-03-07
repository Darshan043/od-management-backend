const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const studentRoutes = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const odRoutes = require('./routes/odRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { verifyOD } = require('./controllers/odController');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const connectDB = require('./config/db');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Connect to Database
connectDB();


// API Routes
app.use('/api/auth/student', studentRoutes);
app.use('/api/auth/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/od', odRoutes);
app.use('/api/reports', reportRoutes);
// Public verification endpoint for Digital OD Pass
app.get('/verify-od/:id', verifyOD);

// Health Check / Test Route
app.get("/health", (req, res) => {
    res.json({ status: "UP", message: "College OD Backend Running..." });
});

app.get("/", (req, res) => {
    res.send("Backend Running...");
});

// Advanced Error Handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
    console.log("Base URL for QR: " + (process.env.BASE_URL || "http://localhost:5000"));
});
