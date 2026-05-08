const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TASKS_TABLE = process.env.TASKS_TABLE || 'hiresphere-tasks';

const tables = [
  {
    TableName: process.env.SUBMISSIONS_TABLE || 'hiresphere-submissions',
    AttributeDefinitions: [{ AttributeName: 'submissionId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'submissionId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: TASKS_TABLE,
    AttributeDefinitions: [{ AttributeName: 'taskId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'taskId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

const SEED_TASKS = [
  {
    taskId: uuidv4(),
    title: 'Two Sum',
    description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\n**Example:**\n\`\`\`\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: nums[0] + nums[1] == 9\n\`\`\`\n\n**Constraints:**\n- 2 <= nums.length <= 10^4\n- -10^9 <= nums[i] <= 10^9\n- Only one valid answer exists.`,
    difficulty: 'Easy',
    timeLimit: 30,
    tags: ['Arrays', 'Hash Table'],
    evaluationCriteria: ['Correctness', 'Time Complexity (O(n) expected)', 'Space Complexity', 'Edge Case Handling'],
    createdAt: new Date().toISOString(),
  },
  {
    taskId: uuidv4(),
    title: 'Longest Substring Without Repeating Characters',
    description: `Given a string \`s\`, find the length of the longest substring without repeating characters.\n\n**Example:**\n\`\`\`\nInput: s = "abcabcbb"\nOutput: 3\nExplanation: The answer is "abc", with length 3.\n\`\`\`\n\n**Constraints:**\n- 0 <= s.length <= 5 * 10^4\n- \`s\` consists of English letters, digits, symbols and spaces.`,
    difficulty: 'Medium',
    timeLimit: 45,
    tags: ['Strings', 'Sliding Window', 'Hash Table'],
    evaluationCriteria: ['Correctness', 'Sliding Window Approach', 'Time Complexity (O(n))', 'Code Readability'],
    createdAt: new Date().toISOString(),
  },
  {
    taskId: uuidv4(),
    title: 'LRU Cache',
    description: `Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement the \`LRUCache\` class:\n- \`LRUCache(int capacity)\` — Initialize with positive size capacity.\n- \`int get(int key)\` — Return the value if key exists, otherwise return -1.\n- \`void put(int key, int value)\` — Update or insert the value. Evict the LRU key if capacity is exceeded.\n\nBoth operations must run in **O(1)** average time.\n\n**Example:**\n\`\`\`\nInput: ["LRUCache","put","put","get","put","get"]\n       [[2],[1,1],[2,2],[1],[3,3],[2]]\nOutput: [null,null,null,1,null,-1]\n\`\`\``,
    difficulty: 'Medium',
    timeLimit: 60,
    tags: ['Design', 'Hash Table', 'Linked List'],
    evaluationCriteria: ['O(1) get and put', 'Correct eviction order', 'Data structure choice justification', 'Code Quality'],
    createdAt: new Date().toISOString(),
  },
  {
    taskId: uuidv4(),
    title: 'Median of Two Sorted Arrays',
    description: `Given two sorted arrays \`nums1\` and \`nums2\` of size \`m\` and \`n\` respectively, return the median of the two sorted arrays.\n\nThe overall run time complexity should be **O(log(m+n))**.\n\n**Example:**\n\`\`\`\nInput: nums1 = [1,3], nums2 = [2]\nOutput: 2.00000\n\nInput: nums1 = [1,2], nums2 = [3,4]\nOutput: 2.50000\n\`\`\`\n\n**Constraints:**\n- nums1.length == m, nums2.length == n\n- 0 <= m, n <= 1000\n- 1 <= m + n <= 2000`,
    difficulty: 'Hard',
    timeLimit: 60,
    tags: ['Arrays', 'Binary Search', 'Divide and Conquer'],
    evaluationCriteria: ['O(log(m+n)) complexity', 'Correctness on odd/even total length', 'Binary search implementation', 'Edge cases (empty arrays)'],
    createdAt: new Date().toISOString(),
  },
  {
    taskId: uuidv4(),
    title: 'Design a Rate Limiter',
    description: `Design and implement a rate limiter that restricts the number of requests a user can make to an API.\n\nRequirements:\n- Support a configurable limit of N requests per time window T (e.g., 100 req/min)\n- Must work correctly under concurrent requests\n- Should be memory efficient\n\nImplement at least one of: Token Bucket, Leaky Bucket, Sliding Window Log, or Fixed Window Counter.\n\nYour solution should include:\n1. The core rate limiter class/module\n2. A brief explanation of the algorithm chosen and its trade-offs\n3. At least 3 unit tests covering normal use, boundary, and burst scenarios`,
    difficulty: 'Medium',
    timeLimit: 75,
    tags: ['System Design', 'Concurrency', 'Design Patterns'],
    evaluationCriteria: ['Algorithm correctness', 'Concurrency safety', 'Memory efficiency', 'Test coverage', 'Trade-off analysis'],
    createdAt: new Date().toISOString(),
  },
  {
    taskId: uuidv4(),
    title: 'Binary Tree Maximum Path Sum',
    description: `A path in a binary tree is a sequence of nodes where each pair of adjacent nodes has an edge. A node can only appear once in the path, and the path does not need to pass through the root.\n\nThe path sum is the sum of the node values in the path. Given the root of a binary tree, return the maximum path sum.\n\n**Example:**\n\`\`\`\nInput: root = [-10,9,20,null,null,15,7]\nOutput: 42\nExplanation: The optimal path is 15 -> 20 -> 7 with sum 42.\n\`\`\`\n\n**Constraints:**\n- Number of nodes: [1, 3 * 10^4]\n- -1000 <= Node.val <= 1000`,
    difficulty: 'Hard',
    timeLimit: 60,
    tags: ['Trees', 'DFS', 'Dynamic Programming'],
    evaluationCriteria: ['Recursive DFS approach', 'Handling negative values', 'Correct global max tracking', 'Time & Space complexity'],
    createdAt: new Date().toISOString(),
  },
];

async function tableExists(name) {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
    return Table.TableStatus === 'ACTIVE';
  } catch {
    return false;
  }
}

async function waitForTable(name) {
  for (let i = 0; i < 30; i++) {
    try {
      const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
      if (Table.TableStatus === 'ACTIVE') return;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Table ${name} did not become active in time`);
}

async function seedTasks() {
  const { Items } = await docClient.send(new ScanCommand({ TableName: TASKS_TABLE, Limit: 1 }));
  if (Items && Items.length > 0) return;

  for (const task of SEED_TASKS) {
    await docClient.send(new PutCommand({ TableName: TASKS_TABLE, Item: { ...task, type: 'common', createdBy: 'system' } }));
  }
  console.log(`Seeded ${SEED_TASKS.length} tasks into ${TASKS_TABLE}`);
}

async function initTables() {
  for (const table of tables) {
    if (await tableExists(table.TableName)) {
      console.log(`Table exists: ${table.TableName}`);
    } else {
      await client.send(new CreateTableCommand(table));
      console.log(`Table created: ${table.TableName}`);
      await waitForTable(table.TableName);
      console.log(`Table ready: ${table.TableName}`);
    }
  }
  await seedTasks();
}

module.exports = { initTables };
