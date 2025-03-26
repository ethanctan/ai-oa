//TODO: Add ability to populate with real data

const knex = require('knex');
const path = require('path');

// Configure knex connection
const db = knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'data.sqlite')
  },
  useNullAsDefault: true
});

// Create the necessary tables if they don't exist
async function initDatabase() {
  // Check if candidates table exists
  const hasCandidatesTable = await db.schema.hasTable('candidates');
  if (!hasCandidatesTable) {
    await db.schema.createTable('candidates', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').notNullable().unique();
      table.boolean('completed').defaultTo(false);
      table.timestamps(true, true);
    });
    
    // Add some dummy data
    await db('candidates').insert([
      { name: 'Jane Smith', email: 'jane.smith@example.com', completed: true },
      { name: 'John Doe', email: 'john.doe@example.com', completed: true },
      { name: 'Alex Johnson', email: 'alex.johnson@example.com', completed: true },
      { name: 'Sam Wilson', email: 'sam.wilson@example.com', completed: true }
    ]);
    
    console.log('Created candidates table with dummy data');
  }

  // Check if tests table exists
  const hasTestsTable = await db.schema.hasTable('tests');
  if (!hasTestsTable) {
    await db.schema.createTable('tests', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('github_repo').nullable();
      table.string('github_token').nullable();
      table.string('initial_prompt', 1000).nullable();
      table.string('final_prompt', 1000).nullable();
      table.string('assessment_prompt', 1000).nullable();
      table.integer('candidates_assigned').defaultTo(0);
      table.integer('candidates_completed').defaultTo(0);
      table.timestamps(true, true);
    });
    
    console.log('Created tests table');
  }

  // Check if test_instances table exists
  const hasTestInstancesTable = await db.schema.hasTable('test_instances');
  if (!hasTestInstancesTable) {
    await db.schema.createTable('test_instances', (table) => {
      table.increments('id').primary();
      table.integer('test_id').unsigned().references('id').inTable('tests');
      table.integer('candidate_id').unsigned().references('id').inTable('candidates').nullable();
      table.string('docker_instance_id');
      table.string('port');
      table.timestamps(true, true);
    });
    
    console.log('Created test_instances table');
  } else {
    // Check if candidate_id column exists and add it if not
    const hasColumn = await db.schema.hasColumn('test_instances', 'candidate_id');
    if (!hasColumn) {
      await db.schema.table('test_instances', (table) => {
        table.integer('candidate_id').unsigned().references('id').inTable('candidates').nullable();
      });
      console.log('Added candidate_id column to test_instances table');
    }
  }

  // Check if test_candidates table exists (junction table)
  const hasTestCandidatesTable = await db.schema.hasTable('test_candidates');
  if (!hasTestCandidatesTable) {
    await db.schema.createTable('test_candidates', (table) => {
      table.increments('id').primary();
      table.integer('test_id').unsigned().references('id').inTable('tests');
      table.integer('candidate_id').unsigned().references('id').inTable('candidates');
      table.boolean('completed').defaultTo(false);
      table.timestamps(true, true);
      
      // Composite unique key to prevent duplicates
      table.unique(['test_id', 'candidate_id']);
    });
    
    console.log('Created test_candidates junction table');
  }
}

module.exports = {
  db,
  initDatabase
}; 