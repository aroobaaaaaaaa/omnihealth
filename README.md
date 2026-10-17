# OmniHealth | Elite Care Portal

A web-based healthcare appointment management system built on **Node.js, Express, and Oracle Database**. OmniHealth connects patients, doctors, and administrators through a single mobile-style portal, backed by a fragmented (multi-branch) Oracle schema that showcases advanced database concepts.

---

## Features

### Patients
- Sign up and log in securely
- Browse doctors by clinic branch (North / South)
- View a doctor's specialization and available time slots
- Book an appointment; already-taken slots are shown as unavailable
- View appointment history and cancel appointments

### Doctors
- Log in to a personal dashboard
- See a daily schedule listing patient names and appointment times
- View profile and specialization

### Administrators
- Dashboard with total bookings and total revenue (sourced from a materialized view)
- Live clinic load (current daily count vs. maximum capacity)
- Controls for refreshing analytics and exporting audit reports

---

## Database Concepts Demonstrated

| Concept | How it is used |
|---|---|
| **Object-relational types** | `Users_Table` stores `Doctor_Sub_Obj` and `Patient_Sub_Obj` subtypes in one table; accessed with `TREAT(VALUE(u) AS ...)` |
| **Horizontal fragmentation** | Appointments are split across `Appt_North` and `Appt_South` by clinic |
| **Global view** | `All_Appointments_Global` unifies both fragments for reads |
| **Materialized view** | `MV_Hospital_Performance` serves fast aggregate stats to the admin dashboard |
| **Sequences** | `user_seq` and `appt_seq` generate primary keys |

---

## Tech Stack

- **Backend:** Node.js, Express 5
- **Database:** Oracle Database (via `oracledb`)
- **Frontend:** HTML, CSS, vanilla JavaScript, Bootstrap 5, Bootstrap Icons
- **Other:** `body-parser`, `json2csv`

---

## Project Structure

```
omnihealth/
├── public/
│   └── index.html      # Single-page frontend
├── server.js           # Express server and API routes
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- Oracle Database (the app expects a service reachable at `localhost:1521/orcl`)
- The OmniHealth database schema (tables, types, views, sequences) created in your Oracle schema

### Installation

```bash
git clone https://github.com/<your-username>/omnihealth.git
cd omnihealth
npm install
```

### Configure the database

Open `server.js` and update `dbConfig` with your own Oracle credentials:

```js
const dbConfig = {
    user: "YOUR_DB_USER",
    password: "YOUR_DB_PASSWORD",
    connectString: "localhost:1521/orcl"
};
```

> **Tip:** Don't commit real credentials. See [Security Notes](#security-notes) for moving these into environment variables.

### Run

```bash
npm start
```

For auto-restart on file changes (Node 18.11+):

```bash
npm run dev
```

Then open **http://localhost:3000**.

---

## Database Objects Required

The application expects the following objects to exist in your Oracle schema:

- **Tables / types:** `Users_Table` (object table of the user supertype with `Doctor_Sub_Obj` and `Patient_Sub_Obj` subtypes), `Doctor_Schedules`, `Clinics`, `Appt_North`, `Appt_South`
- **Views:** `All_Appointments_Global`, `MV_Hospital_Performance` (materialized)
- **Sequences:** `user_seq`, `appt_seq`

Add your SQL scripts (for example under a `/sql` folder) so others can recreate the schema.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Authenticate a user, returns `U_ID`, `U_NAME`, `U_ROLE` |
| `POST` | `/api/signup` | Register a doctor or patient |
| `GET` | `/api/doctors-by-region/:region` | List doctors for `North` or `South` |
| `GET` | `/api/booked-slots/:id` | Booked time slots for a doctor |
| `POST` | `/api/book-appointment` | Book an appointment (routed to the correct clinic fragment) |
| `POST` | `/api/cancel-appointment` | Cancel an appointment by ID |
| `GET` | `/api/patient-history/:id` | A patient's appointment history |
| `GET` | `/api/doctor-dashboard/:id` | A doctor's schedule |
| `GET` | `/api/admin/stats` | Total bookings, revenue, and clinic load |

### Example: book an appointment

```http
POST /api/book-appointment
Content-Type: application/json

{
  "patientId": 12,
  "doctorId": 4,
  "clinicId": 1,
  "date": "2026-10-20",
  "time": "2026-10-20 10:00 AM"
}
```

---

## Security Notes

This is an academic project and **not production-ready**. Before any real deployment:

- Move DB credentials into environment variables (e.g. a `.env` file listed in `.gitignore`)
- Hash passwords (e.g. with `bcrypt`); they are currently stored and compared in plain text
- Add session or token-based authentication and role-based authorization on the API routes
- Validate and sanitize all request input
- Serve over HTTPS

---

## Known Limitations / Roadmap

- [ ] Implement `GET /api/admin/export-audit` (CSV export via `json2csv`) and `POST /api/admin/refresh-mv`, which the admin UI already calls
- [ ] Align the admin clinic-load response with the frontend (the UI reads `name`, `count`, `max`)
- [ ] Support selecting booking dates other than today
- [ ] Add appointment reminders and notifications
- [ ] Add a SQL setup script and seed data
- [ ] Add automated tests

---


## Author

**Arooba** — University Project, OmniHealth
