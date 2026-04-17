const app = require('./app');
const { initFeeAutoGenerator } = require('./services/feeAutoGenerator');
const { ensureSalarySchema } = require('./services/dbMigrate');
const { initSalaryAutoGenerator } = require('./services/salaryAutoGenerator');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  // Auto-generate monthly fee records (runs on 1st day + short catch-up window)
  initFeeAutoGenerator();

  // Ensure salary schema supports payable/paid status, then auto-generate payables
  ensureSalarySchema().then(
    (result) => {
      if (!result.ok) {
        console.warn('[db-migrate] Salary schema not ensured:', result.error);
      }
      initSalaryAutoGenerator();
    },
    (err) => {
      console.warn('[db-migrate] Salary schema check failed:', err);
      initSalaryAutoGenerator();
    }
  );
});
