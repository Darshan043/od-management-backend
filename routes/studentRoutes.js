const express = require("express");
const router = express.Router();

const { registerStudent, loginStudent, addOD } = require("../controllers/studentController");
const { protect, allowStudent, allowFaculty } = require("../middleware/authMiddleware");

router.post("/register", registerStudent);
router.post("/login", loginStudent);
router.put("/:id/add-od", protect, allowFaculty, addOD);

module.exports = router;
