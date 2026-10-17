const path = require('path');
const express = require('express');
const oracledb = require('oracledb');
const bodyParser = require('body-parser');
const { Parser } = require('json2csv');

const app = express();

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================================================
// DB CONFIG
// ======================================================

const dbConfig = {
    user: "AROOBA",
    password: "1234",
    connectString: "localhost:1521/orcl"
};

// ======================================================
// LOGIN
// ======================================================

app.post('/api/login', async (req, res) => {

    const { email, password } = req.body;

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        const result = await conn.execute(
            `SELECT u_id AS U_ID, u_name AS U_NAME, u_role AS U_ROLE
             FROM Users_Table
             WHERE u_email = :email AND u_password = :pass`,
            { email, pass: password },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(401).json({ error: "Invalid login" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// SIGNUP
// ======================================================

app.post('/api/signup', async (req, res) => {

    const role = (req.body.u_role || "").toUpperCase();

    const {
        u_name,
        u_email,
        u_password,
        specialization,
        fee,
        bio,
        license,
        insurance,
        blood,
        contact
    } = req.body;

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        let sql, binds;

        if (role === "DOCTOR") {

            sql = `
                INSERT INTO Users_Table VALUES (
                    Doctor_Sub_Obj(user_seq.NEXTVAL, :name, :email, :pass, 'DOCTOR', :spec, :lic, :fee, :bio)
                )
            `;

            binds = {
                name: u_name,
                email: u_email,
                pass: u_password,
                spec: specialization || "General",
                lic: license || "N/A",
                fee: parseFloat(fee) || 0,
                bio: bio || ""
            };

        } else {

            sql = `
                INSERT INTO Users_Table VALUES (
                    Patient_Sub_Obj(user_seq.NEXTVAL, :name, :email, :pass, 'PATIENT', :ins, :blood, :contact)
                )
            `;

            binds = {
                name: u_name,
                email: u_email,
                pass: u_password,
                ins: insurance || "",
                blood: blood || "",
                contact: contact || ""
            };
        }

        await conn.execute(sql, binds, { autoCommit: true });

        res.json({ message: "Account created" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// ADMIN STATS
// ======================================================

app.get('/api/admin/stats', async (req, res) => {

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        const mv = await conn.execute(`
            SELECT SUM(total_bookings), SUM(total_revenue)
            FROM MV_Hospital_Performance
        `);

        const clinics = await conn.execute(`
            SELECT clinic_name, current_daily_count, max_daily_capacity
            FROM Clinics
        `);

        res.json({
            totalBookings: mv.rows[0][0] || 0,
            revenue: mv.rows[0][1] || 0,
            clinics: clinics.rows
        });

    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// DOCTORS BY REGION (FIXED + RESTORED)
// ======================================================

app.get('/api/doctors-by-region/:region', async (req, res) => {

    const region = (req.params.region || "").toUpperCase();

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        const clinicId = (region === "NORTH") ? 1 : 3;

        const result = await conn.execute(
            `
            SELECT 
                u.u_id,
                u.u_name,
                s.clinic_id,
                TREAT(VALUE(u) AS Doctor_Sub_Obj).specialization,
                TREAT(VALUE(u) AS Doctor_Sub_Obj).bio_description,
                TREAT(VALUE(u) AS Doctor_Sub_Obj).consultation_fee
            FROM Users_Table u
            JOIN Doctor_Schedules s ON u.u_id = s.doc_id
            WHERE s.clinic_id = :id
            `,
            [clinicId],
            { outFormat: oracledb.OUT_FORMAT_ARRAY }
        );

        res.json(result.rows.map(r => ({
    U_ID: r[0],
    U_NAME: r[1],
    CLINIC_ID: r[2],
    SPECIALIZATION: r[3],
    BIO: r[4],
    FEE: r[5]
})));

    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.get('/api/doctor-dashboard/:id', async (req, res) => {

    let conn;

    try {
        conn = await oracledb.getConnection(dbConfig);

        const result = await conn.execute(
            `
            SELECT 
                p.u_name,
                TO_CHAR(a.appt_time, 'HH:MI AM')
            FROM All_Appointments_Global a
            JOIN Users_Table p ON p.u_id = a.patient_id
            WHERE a.doctor_id = :id
            ORDER BY a.appt_time
            `,
            [req.params.id],
            { outFormat: oracledb.OUT_FORMAT_ARRAY } // 🔥 IMPORTANT
        );

        res.json(result.rows.map(r => ({
            patient_name: r[0],
            time: r[1]
        })));

    } catch (err) {
        res.status(500).json({ error: err.message });

    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// BOOK APPOINTMENT
// ======================================================

app.post('/api/book-appointment', async (req, res) => {

    const {
        patientId,
        doctorId,
        clinicId,
        date,   // YYYY-MM-DD
        time    // HH:MI AM/PM or full datetime string
    } = req.body;

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        const table = Number(clinicId) === 3 ? "Appt_South" : "Appt_North";
        console.log("CLINIC ID:", clinicId);
console.log("TABLE:", table);

        await conn.execute(
    `
    INSERT INTO ${table}
    (
        appt_id,
        patient_id,
        doctor_id,
        clinic_id,
        appt_date,
        appt_time,
        status
    )
    VALUES
    (
        appt_seq.NEXTVAL,
        :p,
        :d,
        :c,
        TO_DATE(:appt_date, 'YYYY-MM-DD'),
        TO_TIMESTAMP(:appt_time, 'YYYY-MM-DD HH:MI AM'),
        'CONFIRMED'
    )
    `,
    {
        p: patientId,
        d: doctorId,
        c: clinicId,
        appt_date: date,
        appt_time: time
    },
    { autoCommit: true }
);

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });

    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// CANCEL APPOINTMENT (RESTORED)
// ======================================================

app.post('/api/cancel-appointment', async (req, res) => {

    const { appId } = req.body;

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        await conn.execute(
            `DELETE FROM Appt_North WHERE appt_id = :id`,
            [appId],
            { autoCommit: true }
        );

        await conn.execute(
            `DELETE FROM Appt_South WHERE appt_id = :id`,
            [appId],
            { autoCommit: true }
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// PATIENT HISTORY
// ======================================================

app.get('/api/patient-history/:id', async (req, res) => {

    let conn;

    try {

        conn = await oracledb.getConnection(dbConfig);

        const result = await conn.execute(
            `SELECT A.APPT_ID, D.U_NAME, A.APPT_DATE, A.STATUS
             FROM All_Appointments_Global A
             JOIN Users_Table D ON A.DOCTOR_ID = D.U_ID
             WHERE A.PATIENT_ID = :id`,
            [req.params.id]
        );

        res.json(result.rows.map(r => ({
            id: r[0],
            doctor: r[1],
            time: r[2],
            status: r[3]
        })));

    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// BOOKED SLOTS
// ======================================================

app.get('/api/booked-slots/:id', async (req, res) => {

    let conn;

    try {
        conn = await oracledb.getConnection(dbConfig);

        const result = await conn.execute(
            `SELECT APPT_TIME 
             FROM All_Appointments_Global 
             WHERE DOCTOR_ID = :id`,
            [req.params.id]
        );

        const formatted = result.rows.map(r => {

            let dt = r[0];

            // ensure JS Date
            if (!(dt instanceof Date)) dt = new Date(dt);

            let hours = dt.getHours();
            let minutes = dt.getMinutes();

            let ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            if (hours === 0) hours = 12;

            minutes = String(minutes).padStart(2, '0');

            return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
        });

        res.json(formatted);

    } catch (err) {
        res.status(500).send(err.message);
    } finally {
        if (conn) await conn.close();
    }
});

// ======================================================
// SPA FIX (SAFE)
// ======================================================

app.use((req, res) => {
    if (req.originalUrl.startsWith('/api')) return;
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================================================
// START SERVER
// ======================================================

app.listen(3000, () => {
    console.log("OmniHealth running on http://localhost:3000");
});