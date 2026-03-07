const express = require("express");
const router = express.Router();

const { registerStudent, loginStudent, addOD, getODStatus } = require("../controllers/studentController");
const { protect, allowStudent, allowFaculty } = require("../middleware/authMiddleware");

router.post("/register", registerStudent);
router.post("/login", loginStudent);
router.get("/od-status", protect, allowStudent, getODStatus);
router.put("/:id/add-od", protect, allowFaculty, addOD);

module.exports = router;
