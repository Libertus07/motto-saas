---
name: ai-cost-optimization
description: Guidelines to optimize AI tokens and costs when interacting with APIs
---

# AI Cost and Token Optimization

When creating or modifying AI integration code (e.g., Gemini API):
1. Always prioritize token efficiency.
2. NEVER embed large database lists (such as all ingredients, suppliers, or users) directly into the AI prompt unless heavily filtered.
3. Use the AI strictly as a text/image parser. Perform data matching (e.g., mapping parsed names to database IDs) in the backend code rather than forcing the AI to do exact matching.
