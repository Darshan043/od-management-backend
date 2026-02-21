const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Student = require("./models/Student");

dotenv.config();

const students = [
    {
        regNo: "21CSE001",
        name: "Official Student",
        email: "student1@example.com",
        password: "password",
        department: "CSE",
        year: 3,
        section: "A",
        phone: "9000000001"
    },
    {
        regNo: "21CSE002",
        name: "Puneeth",
        email: "student2@example.com",
        password: "password",
        department: "CSE",
        year: 3,
        section: "A",
        phone: "9000000002"
    },
    {
        regNo: "21CSE003",
        name: "Praveen",
        email: "student3@example.com",
        password: "password",
        department: "CSE",
        year: 3,
        section: "B",
        phone: "9000000003"
    },
    {
        regNo: "21ECE001",
        name: "Darshan",
        email: "student4@example.com",
        password: "password",
        department: "ECE",
        year: 2,
        section: "A",
        phone: "9000000004"
    },
    {
        regNo: "21MECH001",
        name: "Sanjay M",
        email: "student5@example.com",
        password: "password",
        department: "MECH",
        year: 4,
        section: "A",
        phone: "9000000005"
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

        for (const s of students) {
            const exists = await Student.findOne({ email: s.email });
            if (!exists) {
                await Student.create(s);
                console.log(`Added: ${s.email}`);
            } else {
                exists.password = s.password;
                exists.name = s.name;
                exists.regNo = s.regNo;
                await exists.save();
                console.log(`Updated: ${s.email}`);
            }
        }
        console.log("Student Seeding Completed");
    } catch (error) {
        console.error("Student Seeding Failed:", error.message);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

seed();
