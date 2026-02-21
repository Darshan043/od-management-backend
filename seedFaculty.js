const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Faculty = require("./models/Faculty");

dotenv.config();

const facultyMemberData = [
    {
        staffId: "FAC001",
        name: "Official Faculty",
        email: "faculty1@example.com",
        password: "password",
        phone: "9000000002",
        department: "CSE",
        role: "FACULTY"
    },
    {
        staffId: "COORD001",
        name: "Official Coordinator",
        email: "coord1@example.com",
        password: "password",
        phone: "9000000003",
        department: "CSE",
        role: "COORDINATOR"
    },
    {
        staffId: "HOD001",
        name: "Official HOD",
        email: "hod1@example.com",
        password: "password",
        phone: "9000000004",
        department: "CSE",
        role: "HOD"
    },
    {
        staffId: "ADMIN001",
        name: "Official Admin",
        email: "admin1@example.com",
        password: "password",
        phone: "9000000005",
        department: "ADMIN",
        role: "ADMIN"
    }
];

const seed = async () => {
    try {
        console.log("Attempting to connect to MongoDB Atlas...");
        try {
            await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
            console.log("Connected to MongoDB Atlas");
        } catch (err) {
            console.log("Atlas connection failed, falling back to Local MongoDB...");
            await mongoose.connect("mongodb://localhost:27017/od_system");
            console.log("Connected to Local MongoDB");
        }

        for (const f of facultyMemberData) {
            const exists = await Faculty.findOne({ email: f.email });
            if (!exists) {
                await Faculty.create(f);
                console.log(`Added: ${f.email} (${f.role})`);
            } else {
                exists.password = f.password;
                exists.role = f.role;
                exists.name = f.name;
                exists.staffId = f.staffId;
                await exists.save();
                console.log(`Updated: ${f.email}`);
            }
        }
        console.log("Faculty Seeding Completed");
    } catch (error) {
        console.error("Faculty Seeding Failed:", error.message);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

seed();
