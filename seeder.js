const dotenv = require('dotenv');
const connectDB = require('./config/db');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');

dotenv.config();

const seedUsers = async () => {
  try {
    await connectDB();

    // Dummy Student
    const students = [
      {
        regNo: 'REG001',
        name: 'Student One',
        email: 'student1@example.com',
        password: 'password',
        department: 'CSE',
        year: 3,
        section: 'A',
        CGPA: 8.0,
        arrears: 0,
        achievements: [],
        phone: '9999999999'
      }
    ];

    // Dummy Faculty / Coordinator / HOD / Admin
    const facultyUsers = [
      {
        staffId: 'FAC001',
        name: 'Faculty One',
        email: 'faculty1@example.com',
        password: 'password',
        department: 'CSE',
        role: 'FACULTY',
        phone: '9999999998'
      },
      {
        staffId: 'COORD001',
        name: 'Coordinator One',
        email: 'coord1@example.com',
        password: 'password',
        department: 'CSE',
        role: 'COORDINATOR',
        phone: '9999999997'
      },
      {
        staffId: 'HOD001',
        name: 'HOD One',
        email: 'hod1@example.com',
        password: 'password',
        department: 'CSE',
        role: 'HOD',
        phone: '9999999996'
      },
      {
        staffId: 'ADMIN001',
        name: 'Admin One',
        email: 'admin1@example.com',
        password: 'password',
        department: 'CSE',
        role: 'ADMIN',
        phone: '9999999995'
      }
    ];

    // Upsert-style seeding: create if not exists
    for (const s of students) {
      const exists = await Student.findOne({ email: s.email });
      if (!exists) {
        await Student.create(s);
        console.log(`Created student: ${s.email}`);
      } else {
        console.log(`Student already exists: ${s.email}`);
      }
    }

    for (const f of facultyUsers) {
      const exists = await Faculty.findOne({ email: f.email });
      if (!exists) {
        await Faculty.create(f);
        console.log(`Created faculty user (${f.role}): ${f.email}`);
      } else {
        console.log(`Faculty user already exists: ${f.email}`);
      }
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seedUsers();

