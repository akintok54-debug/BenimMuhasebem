const jwt = require("jsonwebtoken");

if (process.env.NODE_ENV === "production" && String(process.env.JWT_SECRET || "").length < 32) {
    throw new Error("Production için en az 32 karakterlik JWT_SECRET zorunludur.");
}

function tokenOlustur(payload) {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "8h",
            issuer: process.env.JWT_ISSUER || "benimmuhasebe-api",
            audience: process.env.JWT_AUDIENCE || "benimmuhasebe-web",
            algorithm: "HS256"
        }
    );
}

function tokenDogrula(token) {
    const decoded = jwt.decode(token);
    const ortak = { algorithms: ["HS256"] };
    if (!decoded?.iss && !decoded?.aud && process.env.JWT_ALLOW_LEGACY !== "false") {
        return jwt.verify(token, process.env.JWT_SECRET, ortak);
    }
    return jwt.verify(token, process.env.JWT_SECRET, { ...ortak, issuer: process.env.JWT_ISSUER || "benimmuhasebe-api", audience: process.env.JWT_AUDIENCE || "benimmuhasebe-web" });
}

function geciciTokenOlustur(payload) { return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m", issuer: process.env.JWT_ISSUER || "benimmuhasebe-api", audience: process.env.JWT_AUDIENCE || "benimmuhasebe-web", algorithm: "HS256" }); }

module.exports = {
    tokenOlustur,
    tokenDogrula,
    geciciTokenOlustur
};
