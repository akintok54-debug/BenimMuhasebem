const jwt = require("jsonwebtoken");

function tokenOlustur(payload) {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d"
        }
    );
}

function tokenDogrula(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
    tokenOlustur,
    tokenDogrula
};
