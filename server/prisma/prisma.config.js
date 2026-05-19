module.exports = {
  datasource: {
    db: {
      provider: "postgresql",
      url: process.env.DATABASE_URL || "postgresql://user:password@localhost:5433/tfg_db"
    }
  }
};
