# Security Spec

1. Data Invariants:
   - A Meme must belong to an author and size of objects must be limited.
   - Favorite must belong to a user.
   - Submission must belong to a user.
   - Template must belong to a user, fields sized.
   - TemplateVote upvoters/downvoters must have limited size.
   
2. Dirty Dozen Payloads:
   - ...
   
3. Test Runner:
   - firestore.rules.test.ts
