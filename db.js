const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const USE_MONGO = !!process.env.MONGODB_URI;
const jsonDbPath = path.join(__dirname, 'database.json');

// -----------------------------------------------------------------------------
// Esquema de Mongoose para MongoDB Atlas
// -----------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    preferredAreas: [{ type: String }],
    preferredCategories: [{ type: String }]
}, { timestamps: true });

const MongoUser = mongoose.models.User || mongoose.model('User', userSchema);

let mongoConnected = false;

// -----------------------------------------------------------------------------
// Inicialización de la Base de Datos
// -----------------------------------------------------------------------------
async function initDB() {
    if (USE_MONGO) {
        try {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('✅ Conectado exitosamente a MongoDB Atlas');
            mongoConnected = true;
        } catch (error) {
            console.error('❌ Error al conectar a MongoDB Atlas. Usando base de datos JSON local como fallback.', error);
            mongoConnected = false;
        }
    } else {
        console.log('ℹ️ MONGODB_URI no detectada. Usando base de datos JSON local (database.json) como fallback.');
        mongoConnected = false;
    }

    // Si falló Mongo o no se configuró, inicializamos el archivo JSON
    if (!mongoConnected) {
        if (!fs.existsSync(jsonDbPath)) {
            fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2));
        }
    }
}

// -----------------------------------------------------------------------------
// Helpers para Base de Datos Local JSON
// -----------------------------------------------------------------------------
function readJSON() {
    try {
        if (!fs.existsSync(jsonDbPath)) {
            fs.writeFileSync(jsonDbPath, JSON.stringify([], null, 2));
        }
        const data = fs.readFileSync(jsonDbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error al leer base de datos JSON:', e);
        return [];
    }
}

function writeJSON(data) {
    try {
        fs.writeFileSync(jsonDbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error al escribir en base de datos JSON:', e);
    }
}

// -----------------------------------------------------------------------------
// Interfaz de Base de Datos Unificada
// -----------------------------------------------------------------------------
const db = {
    getUserByUsername: async (username) => {
        const normalized = username.toLowerCase().trim();
        if (mongoConnected) {
            return await MongoUser.findOne({ username: normalized });
        } else {
            const users = readJSON();
            return users.find(u => u.username === normalized) || null;
        }
    },

    getUserById: async (id) => {
        if (mongoConnected) {
            try {
                return await MongoUser.findById(id);
            } catch {
                return null;
            }
        } else {
            const users = readJSON();
            return users.find(u => u._id === id) || null;
        }
    },

    createUser: async (userData) => {
        if (mongoConnected) {
            const user = new MongoUser(userData);
            return await user.save();
        } else {
            const users = readJSON();
            const newUser = {
                _id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                username: userData.username.toLowerCase().trim(),
                password: userData.password,
                preferredAreas: userData.preferredAreas || [],
                preferredCategories: userData.preferredCategories || [],
                createdAt: new Date().toISOString()
            };
            users.push(newUser);
            writeJSON(users);
            return newUser;
        }
    },

    updateUserPreferences: async (id, preferredAreas, preferredCategories) => {
        if (mongoConnected) {
            return await MongoUser.findByIdAndUpdate(
                id,
                { preferredAreas, preferredCategories },
                { new: true }
            );
        } else {
            const users = readJSON();
            const index = users.findIndex(u => u._id === id);
            if (index !== -1) {
                users[index].preferredAreas = preferredAreas;
                users[index].preferredCategories = preferredCategories;
                writeJSON(users);
                return users[index];
            }
            return null;
        }
    },

    getAllUsers: async () => {
        if (mongoConnected) {
            return await MongoUser.find({}, 'username preferredAreas preferredCategories');
        } else {
            const users = readJSON();
            return users.map(u => ({
                _id: u._id,
                username: u.username,
                preferredAreas: u.preferredAreas,
                preferredCategories: u.preferredCategories
            }));
        }
    }
};

module.exports = { initDB, db };
