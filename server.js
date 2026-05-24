require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const path = require('path');
const { initDB, db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos (como index.html) desde el directorio raíz
app.use(express.static(__dirname));

// Inicializar conexión de base de datos (MongoDB o JSON Fallback)
initDB();

// Helper para formatear arreglos de JS como listas válidas de Prolog (e.g. ['Mexican','Italian'] o [])
const toPrologList = (arr) => {
    if (!arr || arr.length === 0) return '[]';
    return '[' + arr.map(item => `'${item.replace(/'/g, "\\'")}'`).join(',') + ']';
};

// Helper para parsear la lista que retorna Prolog (e.g. "[Mexican, Italian]")
const parsePrologList = (str) => {
    if (!str || str.trim() === '[]') return [];
    return str.replace(/[\[\]]/g, '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);
};

// -----------------------------------------------------------------------------
// RUTAS DE AUTENTICACIÓN
// -----------------------------------------------------------------------------

// Registro de Usuario
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        const existing = await db.getUserByUsername(username);
        if (existing) {
            return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const newUser = await db.createUser({
            username,
            password: hashedPassword,
            preferredAreas: [],
            preferredCategories: []
        });

        return res.status(201).json({
            message: 'Registro exitoso.',
            user: {
                _id: newUser._id,
                username: newUser.username,
                preferredAreas: newUser.preferredAreas,
                preferredCategories: newUser.preferredCategories
            }
        });
    } catch (error) {
        console.error('Error en /api/auth/register:', error);
        return res.status(500).json({ error: 'Error interno en el servidor durante el registro.' });
    }
});

// Inicio de Sesión (Login)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        const user = await db.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Credenciales incorrectas (usuario no encontrado).' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        return res.json({
            message: 'Inicio de sesión exitoso.',
            user: {
                _id: user._id,
                username: user.username,
                preferredAreas: user.preferredAreas,
                preferredCategories: user.preferredCategories
            }
        });
    } catch (error) {
        console.error('Error en /api/auth/login:', error);
        return res.status(500).json({ error: 'Error interno en el servidor durante el login.' });
    }
});

// -----------------------------------------------------------------------------
// RUTAS DE PREFERENCIAS DE USUARIO
// -----------------------------------------------------------------------------

// Guardar Preferencias
app.post('/api/user/preferences', async (req, res) => {
    try {
        const { userId, preferredAreas, preferredCategories } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Se requiere el ID del usuario.' });
        }

        const updatedUser = await db.updateUserPreferences(userId, preferredAreas || [], preferredCategories || []);
        if (!updatedUser) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        return res.json({
            message: 'Preferencias actualizadas.',
            user: {
                _id: updatedUser._id,
                username: updatedUser.username,
                preferredAreas: updatedUser.preferredAreas,
                preferredCategories: updatedUser.preferredCategories
            }
        });
    } catch (error) {
        console.error('Error en /api/user/preferences:', error);
        return res.status(500).json({ error: 'Error al actualizar preferencias.' });
    }
});

// Obtener todos los usuarios registrados (para selección de match)
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.getAllUsers();
        return res.json(users);
    } catch (error) {
        console.error('Error en /api/users:', error);
        return res.status(500).json({ error: 'Error al obtener lista de usuarios.' });
    }
});

// -----------------------------------------------------------------------------
// RUTA DE MATCH Y RECOMENDACIONES (INTERSECCIÓN CON PROLOG & THEMEALDB)
// -----------------------------------------------------------------------------
app.get('/api/match', async (req, res) => {
    try {
        const { u1, u2 } = req.query; // IDs de los usuarios a evaluar

        if (!u1 || !u2) {
            return res.status(400).json({ error: 'Debes proporcionar los parámetros de ID "u1" y "u2".' });
        }

        const user1 = await db.getUserById(u1);
        const user2 = await db.getUserById(u2);

        if (!user1 || !user2) {
            return res.status(404).json({ error: 'Uno o ambos usuarios no existen en el sistema.' });
        }

        // Traducir las listas de gustos a formato de lista Prolog
        const listAreas1 = toPrologList(user1.preferredAreas);
        const listCats1 = toPrologList(user1.preferredCategories);
        const listAreas2 = toPrologList(user2.preferredAreas);
        const listCats2 = toPrologList(user2.preferredCategories);

        const scriptPath = path.join(__dirname, 'comida.pl').replace(/\\/g, '/');

        // Construir el comando swipl pasando las listas por parámetro y capturando el stdout formateado con split "|"
        const command = `swipl -q -f "${scriptPath}" -g "calcular_match_detallado(${listAreas1}, ${listCats1}, ${listAreas2}, ${listCats2}, Porcentaje, AreasComunes, CatsComunes), format('~w|~w|~w~n', [Porcentaje, AreasComunes, CatsComunes]), halt."`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error('Error al ejecutar SWI-Prolog:', error);
                if (error.code === 'ENOENT' || error.message.includes('not found') || error.message.includes('not recognized')) {
                    return res.status(500).json({
                        error: 'El motor de inferencia SWI-Prolog no está instalado en el servidor.',
                        details: error.message
                    });
                }
                return res.status(500).json({
                    error: 'Fallo al procesar las listas en el motor Prolog.',
                    details: stderr.trim() || error.message
                });
            }

            const rawOutput = stdout.trim();
            if (!rawOutput) {
                return res.status(500).json({ error: 'Prolog no devolvió respuesta para las listas ingresadas.' });
            }

            // Parsear el output: Porcentaje|[Area1,Area2]|[Cat1,Cat2]
            const [porcentajeStr, areasComunesStr, catsComunesStr] = rawOutput.split('|');
            const porcentaje = parseFloat(porcentajeStr);
            const areasComunes = parsePrologList(areasComunesStr);
            const catsComunes = parsePrologList(catsComunesStr);

            // -----------------------------------------------------------------
            // ALGORITMO DE RECOMENDACIÓN INTELIGENTE (THEMEALDB)
            // -----------------------------------------------------------------
            let platillosRecomendados = [];

            if (areasComunes.length > 0 || catsComunes.length > 0) {
                try {
                    const fetchPromises = [];

                    // 1. Fetch de platillos de áreas comunes
                    areasComunes.forEach(area => {
                        fetchPromises.push(
                            fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${area}`)
                                .then(r => r.json())
                                .then(data => (data.meals || []).map(m => ({
                                    strMeal: m.strMeal,
                                    strMealThumb: m.strMealThumb,
                                    idMeal: m.idMeal,
                                    matchedBy: 'area',
                                    criteria: area
                                })))
                                .catch(() => [])
                        );
                    });

                    // 2. Fetch de platillos de categorías comunes
                    catsComunes.forEach(cat => {
                        fetchPromises.push(
                            fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${cat}`)
                                .then(r => r.json())
                                .then(data => (data.meals || []).map(m => ({
                                    strMeal: m.strMeal,
                                    strMealThumb: m.strMealThumb,
                                    idMeal: m.idMeal,
                                    matchedBy: 'category',
                                    criteria: cat
                                })))
                                .catch(() => [])
                        );
                    });

                    const results = await Promise.all(fetchPromises);
                    const allMeals = results.flat();

                    // Identificar platillos que cumplen con ambos criterios (Intersección perfecta)
                    const mealMap = {};
                    allMeals.forEach(meal => {
                        if (!mealMap[meal.idMeal]) {
                            mealMap[meal.idMeal] = {
                                strMeal: meal.strMeal,
                                strMealThumb: meal.strMealThumb,
                                idMeal: meal.idMeal,
                                matchTypes: [meal.matchedBy],
                                criteriaList: [meal.criteria]
                            };
                        } else {
                            if (!mealMap[meal.idMeal].matchTypes.includes(meal.matchedBy)) {
                                mealMap[meal.idMeal].matchTypes.push(meal.matchedBy);
                            }
                            if (!mealMap[meal.idMeal].criteriaList.includes(meal.criteria)) {
                                mealMap[meal.idMeal].criteriaList.push(meal.criteria);
                            }
                        }
                    });

                    const uniqueMeals = Object.values(mealMap);

                    // Platillos que tienen tanto coincidencia por Area como por Categoría
                    const perfectMatches = uniqueMeals.filter(m => m.matchTypes.includes('area') && m.matchTypes.includes('category'));
                    const secondaryMatches = uniqueMeals.filter(m => !(m.matchTypes.includes('area') && m.matchTypes.includes('category')));

                    // Ordenar: primero los perfectos, luego los secundarios
                    platillosRecomendados = [...perfectMatches, ...secondaryMatches].slice(0, 8);

                } catch (recError) {
                    console.error('Error al traer recomendaciones de TheMealDB:', recError);
                }
            }

            return res.json({
                match: `${porcentaje}%`,
                porcentaje,
                areasComunes,
                catsComunes,
                recomendaciones: platillosRecomendados
            });
        });
    } catch (error) {
        console.error('Error en /api/match:', error);
        return res.status(500).json({ error: 'Error interno en la ruta de match.' });
    }
});

// -----------------------------------------------------------------------------
// RUTA AUXILIAR: COMIDA POPULAR GENERAL
// -----------------------------------------------------------------------------
app.get('/api/comida-popular', async (req, res) => {
    try {
        const response = await fetch('https://www.themealdb.com/api/json/v1/1/search.php?s=');
        if (!response.ok) {
            return res.status(response.status).json({ error: `Error de TheMealDB: ${response.statusText}` });
        }

        const data = await response.json();
        if (!data.meals) {
            return res.json([]);
        }

        const platillosFiltro = data.meals.map(meal => ({
            strMeal: meal.strMeal,
            strCategory: meal.strCategory,
            strArea: meal.strArea,
            strMealThumb: meal.strMealThumb
        }));

        return res.json(platillosFiltro);
    } catch (error) {
        console.error('Error en /api/comida-popular:', error);
        return res.status(500).json({ error: 'Error al conectar con TheMealDB.' });
    }
});

// -----------------------------------------------------------------------------
// INICIO DE SERVIDOR
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Servidor dinámico de BiteMatch corriendo en http://localhost:${PORT}`);
});
