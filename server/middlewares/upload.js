//Multer Setup 

const multer = require('multer');

const storage = multer.memoryStorage(); 
//memoryStorage() is used to store the uploaded file in memory as a buffer. This is suitable for small files and allows for easy access to the file data without needing to manage temporary files on disk.

//Basically stays at RAM 

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});

module.exports = upload;

//Explanation:
// memoryStorage → file stays in RAM

// Not saved to disk

// Automatically deleted after request finishes

// This satisfies: "ditch resume after extraction"