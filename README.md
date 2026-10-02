Smart Lighting IoT

Backend Node.js + TypeScript + Express y frontend React + Vite.

Requisitos
Node.js 20.19 o superior
Instalación y ejecución
Backend
bash
cd backend
npm install

Copiar example.env (raíz del proyecto) como backend/.env y completar los valores:

bash
# Linux / macOS
cp ../example.env .env

# Windows (PowerShell)
Copy-Item ..\example.env .env
env
PORT=3000
MONGODB_URI=URIDEMONGO
JWT_SECRET=CLAVEULTRAMEGAMARAVILLA
bash
npm run dev

Probar en http://localhost:3000, debe responder:

json
{ "message": "Smart Lighting IoT API funcionando" }
Frontend

En otra terminal:

bash
cd frontend
npm install
npm run dev

Abrir http://localhost:5173

Problemas comunes

Windows: npm.ps1 ... la ejecución de scripts está deshabilitada

powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Remote