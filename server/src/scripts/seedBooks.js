const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const Book = require('../models/Book');
const Category = require('../models/Category');

const catalogue = [
  {
    category: 'Technology',
    author: 'Alex Morgan',
    titles: [
      'Learning JavaScript', 'Python Programming Basics',
      'Understanding Data Structures', 'Modern Web Development',
      'Database Design Essentials', 'Introduction to Cloud Computing',
      'Artificial Intelligence Explained', 'Cybersecurity Fundamentals',
      'The Practical Guide to APIs', 'Software Engineering Principles',
    ],
  },
  {
    category: 'Self-Help',
    author: 'Emily Carter',
    titles: [
      'Build Better Daily Habits', 'The Power of Consistency',
      'A Guide to Personal Growth', 'Small Steps to Success',
      'Mastering Your Time', 'The Confidence Workbook',
      'Focus in a Distracted World', 'Creating a Positive Mindset',
      'The Art of Self Discipline', 'Make Every Day Count',
    ],
  },
  {
    category: 'Business',
    author: 'Daniel Brooks',
    titles: [
      'Starting a Small Business', 'The Entrepreneur Handbook',
      'Marketing for Beginners', 'Understanding Business Finance',
      'Building Strong Teams', 'Customer Service Excellence',
      'The Basics of Leadership', 'Smart Business Strategies',
      'Managing Projects Successfully', 'The Future of E-Commerce',
    ],
  },
  {
    category: 'Fiction',
    author: 'Olivia Bennett',
    titles: [
      'The Forgotten Library', 'Midnight at Silver Lake',
      'The Last Paper Crane', 'A Journey Beyond the Hills',
      'The Secret Garden Gate', 'Letters from Another World',
      'The Clockmaker Mystery', 'Shadows of the Old City',
      'The Lighthouse Keeper', 'The Road to Yesterday',
    ],
  },
  {
    category: 'Science',
    author: 'Michael Reed',
    titles: [
      'Exploring the Universe', 'The Wonders of Physics',
      'Chemistry in Everyday Life', 'The Human Brain Explained',
      'Discovering the Natural World', 'A Beginner Guide to Astronomy',
      'The Science of Climate', 'Understanding Genetics',
      'The Hidden World of Microbes', 'Experiments That Changed History',
    ],
  },
  {
    category: 'Mathematics',
    author: 'Sophia Turner',
    titles: [
      'Everyday Mathematics', 'Algebra Made Simple',
      'A Visual Guide to Calculus', 'The World of Probability',
      'Geometry Through Examples', 'Statistics for Students',
      'Number Theory Essentials', 'The Beauty of Patterns',
      'Practical Linear Algebra', 'Logic and Mathematical Thinking',
    ],
  },
  {
    category: 'Biography',
    author: 'William Parker',
    titles: [
      'The Life of a Visionary', 'A Journey Through Innovation',
      'Stories of Remarkable Leaders', 'The Artist Behind the Masterpiece',
      'An Explorer of New Worlds', 'The Making of a Scientist',
      'A Life Dedicated to Learning', 'The Road to Great Achievement',
      'Voices That Changed History', 'Lessons from Extraordinary Lives',
    ],
  },
  {
    category: 'Education',
    author: 'Grace Wilson',
    titles: [
      'Study Skills That Work', 'Learning English Step by Step',
      'The Student Success Guide', 'Effective Note Taking',
      'Preparing for Examinations', 'Critical Thinking for Beginners',
      'Communication Skills Handbook', 'Learn Through Practice',
      'Research Skills for Students', 'A Guide to Academic Writing',
    ],
  },
  {
    category: 'History',
    author: 'Thomas Mitchell',
    titles: [
      'Civilizations of the Ancient World', 'The History of Trade',
      'Kingdoms and Empires', 'A Journey Through Medieval India',
      'The Age of Exploration', 'Revolutions That Shaped Nations',
      'The Story of Ancient Cities', 'History of Science and Discovery',
      'Life Along the Silk Road', 'The Making of Modern Society',
    ],
  },
  {
    category: 'Health',
    author: 'Isabella Foster',
    titles: [
      'Everyday Wellness', 'The Basics of Healthy Eating',
      'Understanding Sleep', 'A Beginner Guide to Fitness',
      'Mindfulness in Daily Life', 'Building Healthy Routines',
      'The Science of Hydration', 'Healthy Living for Students',
      'Understanding Stress Management', 'The Everyday Nutrition Guide',
    ],
  },
];

function makeDummyIsbn(number) {
  // 12-digit base followed by its ISBN-13 checksum.
  const base = `978${String(number).padStart(9, '0')}`;
  const digits = [...base].map(Number);
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return base + String((10 - (sum % 10)) % 10);
}

async function seedBooks() {
  assertServerConfig();

  let inserted = 0;
  let skipped = 0;
  let categoriesCreated = 0;

  await connectDatabase(config.mongoUri);

  try {
    const categoryIds = new Map();

    // Create or reuse categories without deleting existing records.
    for (const item of catalogue) {
      let category = await Category.findOne({ name: item.category })
        .collation({ locale: 'en', strength: 2 });

      if (!category) {
        category = await Category.create({ name: item.category });
        categoriesCreated++;
      }

      if (category.deletedAt) {
        throw new Error(
          `Category "${item.category}" is soft-deleted. ` +
          'Resolve that category before seeding.',
        );
      }

      categoryIds.set(item.category, category._id);
    }

    for (let i = 0; i < catalogue.length; i++) {
      const item = catalogue[i];

      for (let j = 0; j < item.titles.length; j++) {
        const number = i * 10 + j + 1;
        const isbn = makeDummyIsbn(number);

        // Check all records, including soft-deleted records.
        const existing = await Book.findOne({ isbn });

        if (existing) {
          skipped++;
          continue;
        }

        const title = item.titles[j];

        await Book.create({
          isbn,
          title,
          author: item.author,
          description:
            `${title} is a sample bookstore listing created for ` +
            `testing the catalogue, search, and book details features.`,
          category: categoryIds.get(item.category),
          price: Number((149 + number * 7.5).toFixed(2)),
          coverImageUrl:
            `https://placehold.co/400x600?text=${encodeURIComponent(title)}`,
          markedUnavailable: false,
          averageRating: Number((3.5 + (number % 15) / 10).toFixed(1)),
          reviewCount: number % 25,
        });

        inserted++;
      }
    }

    console.log('\n===== BOOKSTORE SEED SUMMARY =====');
    console.log(`Categories created: ${categoriesCreated}`);
    console.log(`Books inserted: ${inserted}`);
    console.log(`Books skipped: ${skipped}`);
    console.log(`Total sample books defined: 100`);
    console.log('==================================\n');
  } finally {
    await disconnectDatabase();
  }
}

seedBooks().catch((error) => {
  console.error('Book seeding failed:', error.message);
  process.exitCode = 1;
});
