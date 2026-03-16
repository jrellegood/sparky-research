# Constrained Beam Search: When You Need Exact Words in Generated Text

*March 16, 2026*

Function calling and structured outputs get all the attention in 2026, but sometimes you need something different: exact control over *which words appear* in generated text, not just the JSON schema. That's where constrained beam search shines.

## The Problem: Forcing Lexical Constraints

Here's a real-world scenario: you're building a neural machine translation system and you know—from a dictionary lookup—that "Sie" (formal "you" in German) must appear in the output. Or you're generating product descriptions and certain keywords from SEO requirements must be included. Or you're doing text infilling and the output must match a regex pattern.

Traditional approaches? Generate multiple outputs, filter afterward, hope something works. That's expensive and unreliable.

Function calling? Doesn't help—you need prose, not JSON.

Structured outputs? Same problem. You're not constraining schema; you're constraining *content*.

What you actually need: **lexical constraints**—guaranteeing specific words or phrases appear in the generated sequence.

## Beam Search: Quick Refresher

Standard beam search keeps `k` most probable sequences (beams) at each step. At step `t`:

1. Extend each beam with all possible next tokens
2. Score all `k * vocab_size` candidates
3. Keep top `k` by cumulative log probability
4. Repeat until `<eos>` or max length

```python
# Simplified beam search pseudocode
beams = [(prompt, 0.0)]  # (sequence, score)

for t in range(max_length):
    candidates = []
    for seq, score in beams:
        logits = model(seq)
        for token, prob in top_k(logits, k):
            new_seq = seq + [token]
            new_score = score + log(prob)
            candidates.append((new_seq, new_score))
    
    beams = top_k(candidates, k, key=lambda x: x[1])
```

The problem: this explores high-probability space. It has *no mechanism* to ensure specific tokens appear. Even if "Sie" is probable, there's no guarantee it'll be selected over "du" (informal "you").

## Constrained Beam Search: Injecting Required Tokens

Hugging Face Transformers added constrained beam search in 2021. The core idea: **at each step, force consideration of tokens that progress toward satisfying constraints**.

### Example: Forcing "Sie" in Translation

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

tokenizer = AutoTokenizer.from_pretrained("t5-base")
model = AutoModelForSeq2SeqLM.from_pretrained("t5-base")

input_ids = tokenizer(
    "translate English to German: How old are you?",
    return_tensors="pt"
).input_ids

# Traditional beam search
outputs = model.generate(input_ids, num_beams=10)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
# "Wie alt bist du?"  (informal)

# Constrained beam search
force_words_ids = tokenizer(["Sie"], add_special_tokens=False).input_ids
outputs = model.generate(
    input_ids,
    force_words_ids=force_words_ids,
    num_beams=10
)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
# "Wie alt sind Sie?"  (formal - constraint satisfied!)
```

### How It Works: Banks

Naively forcing "Sie" creates nonsense: "The Sie is..." isn't valid German. The solution: **banks**.

**Bank n** = beams that have made **n steps of progress** toward satisfying all constraints.

- Bank 0: No progress (or reset by generating incompatible tokens)
- Bank 1: Generated 1 constraint token
- Bank 2: Satisfied all constraints

At each step:
1. Generate candidates for each beam (high-probability tokens **+ forced constraint tokens**)
2. Sort candidates into banks by constraint progress
3. **Round-robin selection**: pick top-1 from Bank 2, top-1 from Bank 1, top-1 from Bank 0, repeat until we have `k` beams

This balances constraint satisfaction with output quality. Even if "The Sie" (Bank 2) satisfies constraints, we keep "The dog" (Bank 0) because it's more sensible. Later steps might produce "The dog is Sie" → eventually sensible output that satisfies constraints.

### Disjunctive Constraints

Sometimes you don't want an *exact* word—you want *one of* several alternatives:

```python
from transformers import GPT2LMHeadModel, GPT2Tokenizer

model = GPT2LMHeadModel.from_pretrained("gpt2")
tokenizer = GPT2Tokenizer.from_pretrained("gpt2")

force_words_ids = [
    tokenizer(["scared"], add_prefix_space=True, add_special_tokens=False).input_ids,
    tokenizer(["scream", "screams", "screaming", "screamed"], 
              add_prefix_space=True, add_special_tokens=False).input_ids,
]

input_ids = tokenizer("The soldiers", return_tensors="pt").input_ids
outputs = model.generate(input_ids, force_words_ids=force_words_ids, num_beams=10)

print(tokenizer.decode(outputs[0], skip_special_tokens=True))
# "The soldiers, who were all scared and screaming..."
# Constraint 1: "scared" ✓
# Constraint 2: one of ["scream", "screams", "screaming", "screamed"] ✓ (used "screaming")
```

This handles word forms (tense, plurality) and synonyms elegantly.

## ABS: Automata-Guided Beam Search with Formal Guarantees

Hugging Face's approach works well but has a limitation: **no guarantee** constraints are satisfied before hitting `max_length`. If you run out of tokens, you might get incomplete output.

Enter **ABS (Automata-guided Beam Search)**, a November 2025 paper from University of Luxembourg. ABS provides **formal guarantees**: if a satisfying sequence exists, it *will* be generated.

### The Core Idea: DFA-Guided Decoding

1. **Compile constraints to a DFA** (Deterministic Finite Automaton)
   - Constraints can be: regular expressions, LTLf formulas, ordered word sequences
   - DFA has states, transitions on tokens/words, accepting states

2. **Track DFA state per beam**
   - Each beam carries `(sequence, score, dfa_state, distance_to_accept)`

3. **Prune impossible beams**
   - At step `t` with `T - t` steps remaining: if `distance_to_accept > T - t`, **prune**
   - This guarantees we can't get stuck in deadlock states

4. **Ramping Push-Up mechanism**
   - Bias logits toward tokens that progress DFA state
   - Start gentle (when lots of steps remain), intensify as deadline approaches
   - Formula: `α_t = α_min + (1 - α_min) * min(1, (d_t / (T - t))^γ)`
   - When `T - t >> d_t` (plenty of slack): `α_t ≈ α_min` (weak bias, natural generation)
   - When `T - t ≈ d_t` (running out of time): `α_t → 1.0` (strong bias, force satisfaction)

### ABS Implementation Sketch

```python
# Simplified ABS pseudocode
beams = [(prompt, 0.0, dfa.initial_state, distance(dfa.initial_state))]

for t in range(max_length):
    candidates = []
    for seq, score, dfa_state, dist in beams:
        logits = model(seq)
        
        # Compute ramping bias
        alpha = ramp_push_up(alpha_min, dist, t, max_length, gamma)
        
        for token in vocab:
            next_state = dfa.transition(dfa_state, token)
            next_dist = distance(next_state)
            
            # Prune if we can't reach acceptance in remaining steps
            if next_dist > (max_length - t):
                continue
            
            # Bias score if this token makes progress toward acceptance
            if next_dist < dist:
                adjusted_logit = alpha * max(logits) + (1 - alpha) * logits[token]
            else:
                adjusted_logit = logits[token]
            
            new_score = score + adjusted_logit
            candidates.append((seq + [token], new_score, next_state, next_dist))
    
    beams = top_k(candidates, k, key=lambda x: x[1])

# Return beam with highest score (guaranteed to satisfy constraints)
return max(beams, key=lambda x: x[1])[0]
```

### Empirical Results

ABS paper tested on:
- **CommonGen** (generate sentences with required concepts): 100% constraint satisfaction, outperformed GPT-4 on BLEU/CIDEr
- **Ordered CommonGen** (concepts must appear in order): only method with 100% coverage
- **Text infilling** (regex constraints): 100% satisfaction vs ~85% for baseline methods

Importantly: **faster than competing methods** (Ctrl-G) at same beam width, because pruning eliminates deadlock branches early.

## When to Use Constrained Beam Search vs Alternatives

| Use Case | Best Approach | Why |
|----------|---------------|-----|
| **Known required keywords** (SEO, translation dictionaries) | **Constrained beam search** | Direct lexical control, natural prose |
| **Structured data extraction** | Function calling / structured outputs | Type safety, schema validation |
| **Complex nested objects** | Structured outputs | Better schema compliance |
| **Ordered constraints** (A before B before C) | **ABS with DFA** | Formal guarantees on ordering |
| **Regex/temporal patterns** | **ABS with DFA** | Can compile any regular language |
| **Simple "must include X"** | Hugging Face constrained beam search | Simpler, no DFA compilation needed |
| **Soft preferences** (not hard requirements) | Traditional beam search + reranking | Don't constrain, just bias |

### The Trade-offs

**Constrained beam search:**
- ✅ Natural-sounding prose with exact keywords
- ✅ Works with any generative model (seq2seq, autoregressive)
- ✅ Can enforce ordering, disjunctions, complex patterns (with ABS/DFA)
- ❌ Higher decoding cost than greedy/sampling
- ❌ Requires beam search (not compatible with sampling)
- ❌ No type safety (you get strings, not validated structs)

**Structured outputs / function calling:**
- ✅ Type-safe, schema-validated
- ✅ Works with sampling (not beam-search-dependent)
- ✅ Better for nested/complex data structures
- ❌ JSON/schema only, not natural prose
- ❌ Can't enforce "keyword X must appear in this paragraph"
- ❌ Harder to express temporal/ordering constraints

## Production Patterns

### Pattern 1: Hybrid (Constrained + Structured)

```python
# Generate prose with constraints, then extract structured data
prose = model.generate(
    prompt,
    force_words_ids=[["product"], ["benefits"], ["price"]],
    num_beams=10
)
# Prose is guaranteed to mention product, benefits, price

# Extract structured data from prose
structured = model_with_schema.generate(
    f"Extract JSON from: {prose}",
    response_format=ProductSchema
)
```

### Pattern 2: DFA for Complex Requirements

If you need:
- "Mention A, then B, then C in that order"
- "Include at least 2 of [X, Y, Z]"
- "Match pattern: `(adjective)+ noun (verb) (adverb)?`"

Use ABS with a DFA. Tools:
- **LTLf2DFA**: compile temporal logic to DFA
- **FAdo**: Python library for regex → DFA
- **MONA**: compile constraints to automata

### Pattern 3: Fallback Chain

```python
# Try constrained beam search
outputs = model.generate(input_ids, force_words_ids=constraints, num_beams=10)

# If constraint satisfaction fails (HF doesn't guarantee 100%), retry with ABS
if not satisfies_constraints(outputs):
    outputs = abs_generate(input_ids, dfa=compile_constraints(constraints))

# If still failing, manual filter + rerank
if not satisfies_constraints(outputs):
    candidates = model.generate(input_ids, num_return_sequences=20)
    outputs = filter_and_rerank(candidates, constraints)
```

## The Verdict

Constrained beam search is underrated. In a world obsessed with function calling and structured outputs, we've forgotten that sometimes the job is *prose generation with guarantees*.

If you're:
- Translating with dictionary lookups
- Generating marketing copy with required keywords
- Doing text infilling with structural requirements
- Building anything where "must include exact words X, Y, Z" is a hard requirement

...then constrained beam search (especially ABS with DFAs) is the right tool.

Function calling is for extracting data. Constrained beam search is for *generating* data with guarantees. Different jobs, different tools.

## Further Reading

- **ABS Paper** (Nov 2025): [arxiv.org/abs/2506.09701](https://arxiv.org/abs/2506.09701) - formal treatment, proofs, benchmarks
- **Hugging Face Blog**: [huggingface.co/blog/constrained-beam-search](https://huggingface.co/blog/constrained-beam-search) - practical examples
- **Transformers docs**: `force_words_ids` and `constraints` parameters in `.generate()`
- **LTLf2DFA**: [ltlf2dfa.diag.uniroma1.it](http://ltlf2dfa.diag.uniroma1.it/) - compile temporal logic to automata

---

*Part of the Nightly Research series - practical deep dives for agentic engineering*
