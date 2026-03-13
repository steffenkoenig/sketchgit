# GAP-018 – Minderjährigenschutz (Protection of Minors)

**Status:** ❌ Open  
**Priority:** 🔴 Critical  
**Category:** DSGVO Art. 8 / BDSG  
**Effort Estimate:** 4–8 hours  

---

## 1. Description

The application allows any person to register an account and process personal data (email, name) without any age verification or parental consent mechanism. German and EU law (DSGVO Art. 8) requires that processing the personal data of children under 16 through information society services is only lawful if parental consent has been obtained. The registration form and Prisma data model have no age-related fields.

---

## 2. Applicable Law

| Law / Regulation | Article / Paragraph | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 8 Abs. 1 | Processing children's data in information society services requires parental consent; threshold 16 years (member state may lower to 13) |
| DSGVO 2016/679 | Art. 8 Abs. 2 | Controller must make reasonable efforts to verify age and parental consent |
| DSGVO 2016/679 | Art. 6 Abs. 1 | All processing requires a legal basis; for children under threshold, parental consent is required |
| BDSG 2018 | § 7 | German transposition: age threshold is 16 years; § 45 for employee data |
| EU Digital Services Act | Art. 28 | Platforms must not process data of minors for profiling/advertising |
| JuSchG 2021 (Jugendschutzgesetz) | § 1 ff. | Youth protection requirements for telemedia services |
| DSGVO 2016/679 | Art. 83 Abs. 5 | Fine: up to €20M or 4% global turnover |

### German Age Threshold

Germany chose **16 years** as the age threshold for DSGVO Art. 8 consent, which is the maximum allowed by the regulation. A minor under 16 years old cannot legally consent to processing their personal data in information society services without parental or guardian consent.

---

## 3. Current State

**File:** `prisma/schema.prisma`, lines 15–31 – `User` model:
```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  password      String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  // ... no dateOfBirth, no ageVerified, no parentalConsent fields
}
```

**File:** `app/[locale]/auth/register/page.tsx`:
- Registration form accepts name, email, password.
- No date of birth field.
- No age confirmation checkbox.
- No parental consent flow.

**File:** `app/[locale]/auth/signin/page.tsx`:
- No age verification.

**Anonymous use:**
- Anonymous users (no account) can draw on the canvas without any registration.
- Their display name is stored in localStorage – on the client only.
- However, when they join a room via WebSocket, a display name is broadcast to other participants.
- This use case also falls under DSGVO Art. 8 consideration if anonymous users are children.

---

## 4. Risk

| Risk | Detail |
|---|---|
| **Unlawful processing** | Processing a child's personal data without parental consent is unlawful under Art. 6 + Art. 8. No legal basis exists. |
| **Supervisory authority investigation** | A parent filing a complaint triggers a formal DPA investigation. |
| **Fine** | Up to €20M or 4% of global turnover. |
| **Reputational damage** | Especially severe if it involves minors. |

---

## 5. What Needs to Be Done

### 5.1 Choose an Age Verification Approach

Two approaches are available:

#### Approach A – Minimum Age Declaration (Recommended for small operators)

Ask users to confirm they are 16 or older at registration. This is the most pragmatic approach for a small operator and is commonly used.

**Implementation:**
- Add a required checkbox to the registration form:
  ```
  ☐ Ich bestätige, dass ich mindestens 16 Jahre alt bin.
     (I confirm that I am at least 16 years old.)
  ```
- Store a `ageConfirmed: Boolean` + `ageConfirmedAt: DateTime?` in the User model.
- If the checkbox is unchecked, registration is blocked.

**Legal note:** The DSGVO requires "reasonable efforts" to verify age and parental consent. A self-declaration checkbox is considered a minimum reasonable effort for low-risk services (EDPB Guidelines 05/2020 on consent). For higher-risk services, stricter verification is expected.

#### Approach B – Date of Birth Entry with Age Gate

Ask for date of birth, calculate age, and either:
- Block registration if under 16 (no parental consent flow)
- Or trigger a parental consent sub-flow if under 16

**Implementation:**
- Add `dateOfBirth: DateTime?` to User model (nullable to preserve backward compatibility)
- On registration form, add a date picker for date of birth
- Server-side validation: if age < 16, return an error or redirect to parental consent flow
- Do NOT store date of birth permanently if not needed for the service – delete after age verification

### 5.2 Add Minimum Age Declaration to Registration Form

**Minimum implementation (Approach A):**

In `app/[locale]/auth/register/page.tsx`, add before the submit button:
```tsx
<div>
  <input type="checkbox" id="ageConfirm" required />
  <label htmlFor="ageConfirm">
    {t('register.ageConfirmation')}
  </label>
</div>
```

Add to `messages/de.json`:
```json
"register": {
  "ageConfirmation": "Ich bestätige, dass ich mindestens 16 Jahre alt bin. (Art. 8 DSGVO)"
}
```

Add to `messages/en.json`:
```json
"register": {
  "ageConfirmation": "I confirm that I am at least 16 years old. (GDPR Art. 8)"
}
```

### 5.3 Update Registration API Validation

In `app/api/auth/register/route.ts`, extend the Zod schema to validate the age confirmation:

```typescript
export const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(12).max(128),
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm you are at least 16 years old.' }),
  }),
});
```

### 5.4 Update Prisma User Model

Add the confirmation field to the User model:
```prisma
model User {
  // ... existing fields
  ageConfirmed    Boolean   @default(false)
  ageConfirmedAt  DateTime?
}
```

Set `ageConfirmed = true` and `ageConfirmedAt = new Date()` when a user registers.

### 5.5 Handle Anonymous Users

Anonymous users who draw on the canvas do not register an account. Their display name is only in `localStorage`. For this use case:
- No personal data is processed server-side (cursor positions are ephemeral in WebSocket)
- No server-side age gating is technically feasible for anonymous use
- The Terms of Service (GAP-010) should state that the service is intended for users aged 16 and over
- The privacy policy should state: "Our service is not directed at children under 16. Anonymous users do not create accounts."

### 5.6 Update Privacy Policy and Terms of Service

**Privacy policy (GAP-002) – add:**
```
Nutzung durch Minderjährige

Unser Dienst richtet sich nicht an Kinder unter 16 Jahren. Die Registrierung 
erfordert eine ausdrückliche Bestätigung, dass der Nutzer mindestens 16 Jahre 
alt ist (Art. 8 DSGVO, § 7 BDSG).

Wenn wir davon Kenntnis erlangen, dass Daten eines Kindes unter 16 Jahren 
ohne elterliche Einwilligung verarbeitet wurden, werden diese Daten 
unverzüglich gelöscht.
```

**Terms of Service (GAP-010) – add:**
```
Unser Dienst richtet sich an Personen ab 16 Jahren. Personen unter 16 Jahren 
dürfen den Dienst nicht ohne die Einwilligung und Aufsicht eines 
Erziehungsberechtigten nutzen.
```

---

## 6. Verification

1. Registration form has a required age confirmation checkbox.
2. Attempting to register without checking the checkbox returns a validation error.
3. API `POST /api/auth/register` with `ageConfirmed: false` returns HTTP 400 with `VALIDATION_ERROR`.
4. `User` model in Prisma has `ageConfirmed` and `ageConfirmedAt` fields.
5. Privacy policy states the 16+ age requirement.
6. Terms of Service states the 16+ age restriction.
