# GAP-020 – Datenschutzbeauftragter (Data Protection Officer – DPO Assessment)

**Status:** ❌ Open  
**Priority:** 🟡 Medium  
**Category:** DSGVO Art. 37  
**Effort Estimate:** 2–4 hours (assessment + documentation)  

---

## 1. Description

Article 37 DSGVO requires controllers to designate a Data Protection Officer (DPO) in specific circumstances. Currently, no DPO has been appointed and no formal written assessment of whether the obligation applies has been made. Under DSGVO Art. 37 Abs. 7, the identity and contact details of the DPO (if appointed) must be published, and under Art. 37 Abs. 6, the reasoning for not appointing a DPO must be documented if the threshold is not met.

---

## 2. Applicable Law

| Law / Regulation | Article | Requirement |
|---|---|---|
| DSGVO 2016/679 | Art. 37 Abs. 1 | DPO mandatory in three cases (see below) |
| DSGVO 2016/679 | Art. 37 Abs. 5 | DPO must have expert knowledge of data protection law |
| DSGVO 2016/679 | Art. 37 Abs. 6 | DPO may be internal or external (service contract) |
| DSGVO 2016/679 | Art. 37 Abs. 7 | Contact details of DPO must be published and notified to DPA |
| DSGVO 2016/679 | Art. 38 | DPO must be involved in all data protection matters |
| DSGVO 2016/679 | Art. 39 | DPO tasks: monitoring compliance, advising, cooperating with DPA |
| DSGVO 2016/679 | Art. 83 Abs. 4 | Fine for failure to designate: up to €10M or 2% global turnover |
| BDSG 2018 | § 38 | German supplementation: DPO mandatory if >20 persons process personal data |

---

## 3. When Is a DPO Mandatory? (Art. 37 Abs. 1)

A DPO is **mandatory** in three cases:

| Case | Condition | Applies to SketchGit? |
|---|---|---|
| Art. 37 Abs. 1 lit. a | Processing by a public authority or body | ❌ No |
| Art. 37 Abs. 1 lit. b | **Core activities** that require **regular and systematic monitoring** of data subjects on a **large scale** | ⚠️ Assessment needed |
| Art. 37 Abs. 1 lit. c | **Core activities** that consist of **large-scale processing** of special categories (Art. 9) or criminal data (Art. 10) | ❌ Not the core purpose |

### German Supplementation – BDSG § 38

Under BDSG § 38, a DPO is **additionally mandatory** (beyond the DSGVO cases) if:
- More than **20 persons** are **regularly** involved in the **automated processing** of personal data

For a solo operator or small team (fewer than 20 persons with data access), this threshold is not met.

---

## 4. Assessment for SketchGit

### 4.1 "Core Activities" Analysis

The core activities of SketchGit are:
1. Providing a collaborative drawing canvas
2. Version control (git-like commits, branches)
3. Room-based access management

Personal data processing (user accounts, sessions, activity logs) is **ancillary** to these core activities – it supports delivery of the service but is not the core activity itself.

**Preliminary result:** Processing of personal data is NOT a core activity → Art. 37 Abs. 1 lit. b/c base conditions not met.

### 4.2 "Regular and Systematic Monitoring" Analysis

Does SketchGit regularly and systematically monitor data subjects?

| Criterion | SketchGit | Assessment |
|---|---|---|
| Behavioural targeting | ❌ No | No user profiling or targeting |
| Activity tracking for analytics | ❌ No | Activity log is for audit trail, not analytics |
| Location tracking | ❌ No | |
| Network monitoring across services | ❌ No | |
| Cursor/presence tracking | ✅ Yes | Real-time position broadcast; ephemeral |

**Preliminary result:** No regular and systematic monitoring for the purpose of profiling or targeting data subjects. Ephemeral cursor tracking in shared rooms does not meet this threshold.

### 4.3 "Large Scale" Analysis

EDPB Guidelines 07/2020 define "large scale" with reference to:
1. Number of data subjects
2. Volume of data
3. Duration/permanence of processing
4. Geographic extent

For a startup SketchGit application:
- User base is small (start-up phase)
- Data categories are limited (email, name, canvas JSON)
- Not processing across multiple countries at scale

**Preliminary result:** Processing is NOT on a large scale for a startup deployment.

### 4.4 BDSG § 38 Assessment

If the operator is a solo developer or small team (< 20 persons with data system access):
- BDSG § 38 threshold not met
- DPO not mandatory under German supplementary law

---

## 5. Conclusion

**For a solo operator or small team operating SketchGit:**

A formal DPO designation is **not mandatory** under Art. 37 DSGVO or BDSG § 38 **at the time of the initial launch**, provided:
- Fewer than 20 persons have access to the data processing systems
- The user base is in the startup/growth phase (not yet "large scale")
- No systematic behavioural monitoring is performed

**This assessment must be reviewed** if:
- The user base grows beyond ~100,000 registered users
- The team grows to 20+ persons with data system access
- New features involving systematic user monitoring are added
- The service is expanded to multiple EU countries at scale

---

## 6. What Needs to Be Done

### 6.1 Write the DPO Assessment Document

Create an internal document (can be part of the VVT – GAP-008):

```
DPO-Schwellenwertprüfung (Art. 37 DSGVO / § 38 BDSG)
Datum: [YYYY-MM-DD]
Betreiber: [Name]

Ergebnis: Ein Datenschutzbeauftragter (DSB) ist nach derzeitigem Stand
NICHT erforderlich, da:

1. Die Verarbeitung personenbezogener Daten ist keine Kerntätigkeit des 
   Unternehmens, sondern dient der Erbringung des Dienstes (Art. 37 Abs. 1 
   lit. b/c DSGVO – keine Kerntätigkeit).

2. Keine regelmäßige und systematische Überwachung von Betroffenen in 
   großem Umfang erfolgt (Art. 37 Abs. 1 lit. b DSGVO).

3. Die Anzahl der Personen, die personenbezogene Daten automatisiert 
   verarbeiten, beträgt weniger als 20 (§ 38 BDSG).

Diese Einschätzung ist jährlich oder bei wesentlichen Änderungen der 
Verarbeitungsaktivitäten zu überprüfen.
```

### 6.2 Add Statement to Privacy Policy and Impressum

Even if no DPO is appointed, the privacy policy (GAP-002) must address this:

```
Datenschutzbeauftragter

Ein Datenschutzbeauftragter ist nach Art. 37 DSGVO und § 38 BDSG 
nicht benannt. Für datenschutzrechtliche Anfragen wenden Sie sich 
bitte an:

[Name / Organisation]
E-Mail: datenschutz@[ihre-domain.de]
```

### 6.3 Consider Voluntary DPO Appointment

Even if not mandatory, appointing an **external DPO on a service basis** is recommended as the user base grows. External DPO services in Germany typically cost €200–€500/month for small operators and provide:
- Expert review of data protection compliance
- Support with DSAR responses (GAP-004)
- Incident response guidance (GAP-007)
- Ongoing monitoring of regulatory changes

**External DPO directories:**
- [GDD Gesellschaft für Datenschutz und Datensicherheit e.V.](https://www.gdd.de)
- [BvD Berufsverband der Datenschutzbeauftragten Deutschlands](https://www.bvdnet.de)

### 6.4 Annual Reassessment

Add a reminder to review the DPO assessment annually or when:
- User registrations exceed 50,000
- Team grows beyond 15 persons with data access
- New processing activities are added that involve monitoring

---

## 7. Verification

1. DPO assessment document exists, is dated, and is reviewed annually.
2. Privacy policy contains a statement about DPO status (either name/contact of DPO, or statement that none is required with reasoning).
3. If user base grows significantly, DPO reassessment has been conducted.
