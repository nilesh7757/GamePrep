export const fallbackChallenges = {
  dsa: [
    {
      scenario: "You are optimizing a real-time trading engine where every microsecond counts.",
      code_snippet: "std::unordered_map<long long, int> price_cache;\n// 10^6 insertions follow...",
      question: "In a Competitive Programming environment like Codeforces, why might this snippet lead to a Time Limit Exceeded (TLE) error?",
      options: [
        "unordered_map is always slower than std::map.",
        "Worst-case O(N) complexity due to hash collisions from anti-hash test cases.",
        "Memory fragmentation from bucket resizing.",
        "The key type 'long long' is too large for the hash function."
      ],
      correct_index: 1,
      explanation: "Hackers can design 'anti-hash' test cases where many keys produce the same hash, forcing O(N) lookups. To fix this, use a custom random-seed hash or std::map (O log N)."
    },
    {
      scenario: "A recursive function is designed to find the longest path in a DAG with 10^5 nodes.",
      code_snippet: "int solve(int u) {\n  int res = 0;\n  for(int v : adj[u]) res = max(res, 1 + solve(v));\n  return res;\n}",
      question: "This code results in a Runtime Error. What is the most likely cause?",
      options: [
        "Integer overflow of 'res'.",
        "Memory limit exceeded due to the adjacency list.",
        "Stack overflow due to recursion depth.",
        "Logic error: DAGs cannot have paths that long."
      ],
      correct_index: 2,
      explanation: "10^5 recursion depth exceeds the default stack size on most systems. You must use iterative DP or increase the stack limit (system-specific)."
    }
  ],
  ml: [
    {
      scenario: "You are training a 50-layer deep neural network for image recognition, but the loss isn't moving.",
      code_snippet: "model.add(Dense(64, activation='sigmoid')) // Repeated 50 times",
      question: "Why is the network failing to learn during backpropagation?",
      options: [
        "Exploding gradients.",
        "Vanishing gradients: Sigmoid derivatives are very small (< 0.25).",
        "The learning rate is too high for Sigmoid.",
        "Sigmoid only works for binary classification."
      ],
      correct_index: 1,
      explanation: "Sigmoid's derivative peaks at 0.25. When you multiply these over 50 layers, the gradient becomes nearly zero, preventing the weights in early layers from updating."
    },
    {
      scenario: "Your model has high training accuracy (99%) but low validation accuracy (60%).",
      code_snippet: "N/A",
      question: "What is the primary phenomenon occurring here, and how would you fix it?",
      options: [
        "Underfitting; add more neurons.",
        "Overfitting; use Dropout or L2 Regularization.",
        "Data leakage; shuffle the validation set.",
        "The model is too simple for the data."
      ],
      correct_index: 1,
      explanation: "This is a classic case of overfitting (high variance). Regularization techniques like Dropout help the model generalize by preventing it from memorizing the training noise."
    }
  ],
  system_design: [
    {
      scenario: "You need to distribute requests across 1000 servers, but adding or removing a server shouldn't re-map every single key.",
      code_snippet: "server_id = hash(user_id) % num_servers;",
      question: "What architecture pattern solves the massive re-mapping problem?",
      options: [
        "Round Robin DNS.",
        "Consistent Hashing using a logical ring.",
        "Database Sharding by primary key.",
        "Master-Slave replication."
      ],
      correct_index: 1,
      explanation: "Consistent Hashing ensures that when a server is added/removed, only k/n keys need to be remapped, where k is the number of keys and n is the number of servers."
    },
    {
      scenario: "You are building a global chat app. Users in India should have low latency, but data must be consistent globally.",
      code_snippet: "N/A",
      question: "According to the CAP Theorem, if you prioritize Consistency and Partition Tolerance, what do you sacrifice?",
      options: [
        "Availability.",
        "Security.",
        "Storage Capacity.",
        "Network Speed."
      ],
      correct_index: 0,
      explanation: "CAP Theorem states you can only have two. Choosing Consistency (C) and Partition Tolerance (P) means the system will return an error (sacrifice Availability) if it cannot guarantee consistent data across nodes."
    }
  ],
  oops_db: [
    {
      scenario: "A bank transfer requires two database updates. Both must succeed, or both must fail.",
      code_snippet: "UPDATE accounts SET bal = bal - 100 WHERE id = 1;\nUPDATE accounts SET bal = bal + 100 WHERE id = 2;",
      question: "Which ACID property ensures that the database doesn't end up in an intermediate state if the system crashes midway?",
      options: [
        "Atomicity.",
        "Consistency.",
        "Isolation.",
        "Durability."
      ],
      correct_index: 0,
      explanation: "Atomicity ensures the transaction is 'all or nothing'. If the second update fails, the first is rolled back automatically."
    }
  ]
};
