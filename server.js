const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const studentRoutes = require("./routes/studentRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const odRoutes = require("./routes/odRoutes");
const reportRoutes = require("./routes/reportRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const { verifyOD } = require("./controllers/odController");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const connectDB = require("./config/db");
const startEscalationScheduler = require("./escalationScheduler");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads directories exist
["uploads", "uploads/reports"].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// API Routes
app.use("/api/auth/student", studentRoutes);
app.use("/api/auth/faculty", facultyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/od", odRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/analytics", analyticsRoutes);

// Public QR verification
app.get("/verify-od/:id", verifyOD);

// Health Check
app.get("/health", (req, res) => {
    res.json({
        status: "UP",
        message: "College OD Backend Running..."
    });
});

// Root route
app.get("/", (req, res) => {
    res.send("Backend Running...");
});

// Error Handling
app.use(notFound);
app.use(errorHandler);

// Start Server AFTER DB Connection
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {

        console.log("Connecting to MongoDB Atlas...");

        await connectDB();

        console.log("MongoDB Atlas Connected");

        // Start Escalation Scheduler
        startEscalationScheduler();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Base URL for QR: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();