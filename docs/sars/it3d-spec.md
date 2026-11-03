# IT3(d) file specification (s18A donations), copied from the SARS BRS

Source: SARS External BRS "IT3 Data Submission", version 4.0.0D-10, 7 October 2022 (`brs.pdf`, 272 pages). "p." = the BRS's printed page number (it matches the PDF page index). Where the guide is cited, it is GEN-ENR-01-G03 Revision 6, effective 7 April 2026 (`guide.pdf`, 41 pages), cited as "Guide p.".

**Read this first: the PDF has tracked changes.** Struck-through text (deleted rules) is still in the PDF and `pdftotext` prints it as if it were live. Every IT3(d) page (p.203 to p.235) was checked visually. Struck-through rules are listed below as **[DELETED in PDF]** and must NOT be implemented. Text highlighted in cyan is a change in this version and is live.

Struck-through (deleted) items found in the IT3(d) section:
- Field 206 logic validation "Value must not = INDIVIDUAL or FOREIGN_INDIVIDUAL or INDIVIDUAL_ESTATE" (p.210). Live text says instead: "Individuals as Submitting Entity will be allowed."
- Field 412 description "If only an 'internal Identification Number' is available, then use Donor Identification Type (Field 411) = 009 and include it in this field." and data validation "If no Identification Number (not even an Internal Identification Number) is available, then use Donor Identification Type (Field 411) = 009 and include 'NOIDNUMBER' in this field." (p.225). The live rule on field 411 is "Must ≠ 009".
- Field 415 data validation "If no data available, then insert '0001-01-01'" (p.226).
- The whole first field numbered 416, "Donor South African resident for tax purposes indicator" (C, A, VAR, 0:1/1:1, Y/N/U rules) (p.226-227). The live field 416 is "Donor Number".

---

## 1. General file rules that apply to IT3(d)

Section 5 "General rules for import file structures" (p.16-19), section 6 "File layouts" (p.20), section 6.5 notes (p.203-204), definitions (p.8-9).

| Topic | Rule (verbatim or condensed verbatim) | Page |
|---|---|---|
| Applies to | "All files submitted after the implementation date must be according to the new requirements regardless of the period." | p.16 (5a) |
| One entity / type / year | "Each file submitted to SARS must only contain information for one submitting entity, one tax type [only IT3(b) or IT3(c) or IT3(d) or IT3I or IT3(s)] and for one fiscal year." | p.16 (5b) |
| Sections in a file | Submission file header; Submitting entity data; ... Reporting entity (IT3(d)); Donor entity (IT3(d)); Donation record (IT3(d)); File trailer | p.16 (5c) |
| Record order | "The sections of the file must be in the sequence specified in the file layout below. This implies the first record in the file will be the general header; the second record will be the submitting entity demographic record, then all the IT3 data information will follow, and lastly the trailer record." | p.16 (5d) |
| MW / CW | "Fields that is indicated as mandatory or conditional with warning ... the field can be left blank for a pre-defined time period and SARS will accept a record where such a field has not been completed. At the applicable time the field will revert to the intended Mandatory or Conditional type and at such time SARS will reject the records if not completed." | p.16 (5e) |
| No leading spaces | "Data fields must not start with a space." | p.16 (5f) |
| Encoding | "All files must conform to the LATIN-1 character encoding." (Definitions also say "ISO-8859-1 encoding or informally referred to as Latin-1", p.9.) | p.16 (5h) |
| Delimiter, empty fields | "A pipe delimited file format will be used, where the fields are separated by a pipe delimiter. For any field where no value is required or no value is available, the pipe delimiter must be followed by another pipe delimiter to indicate that the field is empty, e.g. "\|\|"." | p.16 (5i) |
| Start / end of record | "Each record must start with the field and not the pipe "\|". The first pipe must appear after the first field and the end of the record does not get a closing pipe it gets a carriage return to indicate end of record." | p.17 (5j) |
| Line ending | Only the words "a carriage return" are given. UNCLEAR: p.17. The BRS does not say CR alone, LF, or CRLF. | p.17 |
| Pipe in values | "A pipe, "\|", character may not be used within any field value (e.g. as a special character). If it is, it will be regarded as the start of the next field." | p.19 (5n) |
| Blank / NULL | "When the word 'blank' or NULL is used in this document it means that a field length of 0:0 is applicable, or the field contains no value ... In the data file this will be the lack of any character within two adjacent pipes '\|\|'." | p.19 (5o) |
| Quoting / escaping | Not mentioned anywhere. There is no quote or escape mechanism; a pipe cannot appear in a value. | - |
| File name (submission) | "Data Type Being Supplied (value of field 8)\_File Layout Version (value of field 4)\_Tax Reference Number (value of field 28)\_Unique File ID (value of field 5)\_Message Create Date (value of field 3)" | p.20 |
| File name notes | "All the field values in the file name must be separated by an "\_" and there must be no spaces between any characters." "For the purpose of creating the file name the Message Create Date in the file name must be in the format CCYYMMDDThhmmss." | p.20 |
| File name example (assembled from the rule, not given by SARS) | `I3D_1_<10-digit tax ref>_<UniqueFileID>_20270415T093000.psv` | p.20 |
| File name, tax reference | UNCLEAR: p.20. The pattern says "Tax Reference Number (value of field 28)". Field 28 is the IT3(b) numbering. In the IT3(d) layout the Submitting Entity tax reference is field 216 and there is no field 28. | p.20 |
| File name (response) | "Data Type Being Supplied\_ File Layout Version (value of field 4)\_Tax Reference Number\_Unique File ID\_Message Create Date\_"R"File Response Code" | p.20 |
| Extensions | "For IT3(b), (c), (d), (e) or (s) the file name must be followed by either a .psv or a .txt or a .zip extension." | p.20 |
| Size limits | None stated in the BRS. Guide p.4: "Connect Direct is recommended for large-scale data submissions." "HTTPS should be used for medium-sized data submissions." No byte limits are given. | Guide p.4 |
| Messages | At most 3 messages: 1 IT3 submission (sender "3rd Party application / eFiling"), 2 acknowledgement of receipt before validation, 3 accepted/rejected notification with rejection reason. | p.20 |
| Monetary values | "All monetary values are in South African Rand." | p.204 (Note 8) |
| Field number vs order | "Note 1: The number column is used to reference fields in the table for ease of use and does not indicate sequence in the file." | p.203 |
| Bulk / real time | "Fields marked with Bulk (B) is for submissions via eFiling, HTTPS or C:D." "Fields marked with Real Time (R) is for submissions via API process (this implementation is for a future phase – not applicable to this BRS)." | p.203 (Note 4) |
| Declaration | "Note 7: The IT3-02 declaration will be processed by the Submitting Entity (SE) – and not on the Reporting Entity (RE) level." | p.204 |

### Data types (Definitions, p.8-9)

| Code | Definition (verbatim) |
|---|---|
| A | "Alphabet A until Z only (Upper and Lower Case)" |
| AN | "Alphabet A until Z (Upper Case and Lower Case), AND Numbers 0 to 9 and a decimal point" |
| ANS | "Alphabet A until Z (Upper Case and Lower Case), AND Numbers 0 to 9 and a decimal point, AND a space character" |
| N | "Numbers from 0 to 9, a decimal point and negative (-) sign." |
| FT | Letters A-Z upper and lower case, 0-9, dash (-), space, inverted commas (""), back slash (\), forward slash (/), ?, @, &, $, !, #, +, =, ;, :, comma, apostrophe, brackets ( ), full stop, "Characters such as ê, ë." "All special characters are allowed, however for XML development purposes the following standard must be adhered to: ISO-8859-1 encoding or informally referred to as Latin-1." |

Notes: underscore (\_) is not in the FT list, and AN does not allow a dash except in field 5 (see field 5).

### Required types (p.203, Note 2)
- M = "Mandatory: Implying the field must always be completed"
- C = "Conditional: Implying the field must always be completed under the defined conditions, else it can be left blank"
- O = "Optional: Implying the field can be completed if possible"
- MW = mandatory with warning (blank accepted for a pre-defined period, then reverts to M)
- CW = conditional with warning (blank accepted for a pre-defined period when the condition is met, then reverts to C)

### Validation order and file outcome

Whole-file outcomes (p.17, 5k):
1. "SARS will reject an entire file under the following conditions: File is corrupt, i.e. the file could not be read; File fails structure validations, i.e. error(s) were found in the number of pipe separators in the submission file header, summary or line item level taxpayer data header, body or trailer, or specific field errors were found in the submission file header, summary or line item level taxpayer data header or trailer."
2. "SARS will accept an entire file under the following conditions: Zero fields were rejected; One or more records were found to be duplicates."
3. "SARS will partially upload a file under the following conditions: One or more record(s) were rejected, but not all records."

So: any field error in the header (GH, SE) or trailer rejects the whole file; field errors in body records (RE, DE, DR) reject only those records.

Per-field validation order (p.17, 5l): 1 Required, 2 Data type, 3 Length type, 4 Length min:max, 5 Data validations, 6 Logic validations. "Once a field has failed any one of these validations no further validations will be done on that field."

File structure validation order (p.18, 5m). Failure gives File Response Code 005 with a File Response Reason:

| No | Validation | File Response Reason |
|---|---|---|
| 1 | Does the file have a header, body and trailer identifier | Missing required section either header, body, or trailer |
| 2 | Does the generic header structure pass i.e. are there the correct amount of pipes | Generic header contains the incorrect number of fields |
| 3 | Does the trailer structure pass i.e. are the number of pipes correct | Trailer contains the incorrect number of fields |
| 4 | Does the submission file header structure pass i.e. are the number of pipes correct | Product header contains the incorrect number of fields |
| 5 | Does the body structure pass i.e. are the number of pipes correct and are the records submitted in the correct sequence | One or more body items contain the incorrect number of fields, or the records were submitted in the incorrect sequence |
| 6 | Validate the generic header data – actual content according to the spec | Invalid data in generic header |
| 7 | Validate the submission file header data – actual content according to the spec | Invalid data in submission file header |
| 8 | Validate the trailer: Is the correct data used in the correct fields – actual content according to spec | Invalid data in trailer |
| 9 | Validate the trailer: Do the calculated fields in the trailer add up | Trailer calculation failed |

"Note – if file did not pass validation numbers 1 to 6, then the acknowledgement of receipt cannot be issued and instead a rejection message will be sent." (p.18)

---

## 2. IT3(d) file structure (p.204, table "IT3(d) File Structure", version mark V.8)

| Record | Condition rule | Unique Number | I3D Unique Number > links to > Unique Number | Relational link | Section identifier | Section type |
|---|---|---|---|---|---|---|
| SUBMISSION FILE HEADER (Person doing actual submission) | Mandatory Record 1:1 | - | - | - | Header (`H`) | GH |
| SUBMITTING ENTITY (e.g. Tax Practitioner, Individual or general entity that works with a power of attorney etc) | Mandatory Record 1:1 | - | - | - | Header (`H`) | SE |
| REPORTING ENTITY: Section 18A Approved Entity / Donation Recipient (Usually non-profit organisation or Trust - cannot be an Individual) | Mandatory Record 1:∞ | Field 304 | - | - | Body (`B`) | RE |
| DONOR ENTITY | Conditional Record: If Null Declaration = N Then one or more records must be provided (1:∞), Else If Null Declaration = Y Then No record must be provided (0:0) | Field 404 | Field 406 > links to > Field 304 | Links to: REPORTING ENTITY (RE) | Body (`B`) | DE |
| DONATION RECORD (e.g. monthly donations one receipt for year, or money + physical goods) | Mandatory Record: For each Donor Entity record there should be 1:∞ Donation record(s) supplied | Field 504 | Field 506 > links to > Field 404 | Links to: DONOR ENTITY (DE) | Body (`B`) | DR |
| FILE TRAILER | Mandatory Record 1:1 | - | - | - | Trailer (`T`) | T |

How the records link:
- Each RE has its own Unique Number (304). Null Declaration (329) on the RE says whether DE records follow for it: `N` = one or more DEs; `Y` = none (p.221, p.222 heading).
- Each DE has its own Unique Number (404) and carries "I3D Unique Number" (406), which "Must be equal to a Unique Number (Field 304) where Record Type = RE" (p.224).
- Each DR has its own Unique Number (504) and carries "I3D Unique Number" (506), which "Must be equal to a Unique Number (Field 404) where Record Type = DE" (p.233).
- Unique Numbers 304/404/504: "Must be unique within the section across all files"; "If the record status ... = C or D, then this number must contain the number that was originally submitted" (p.215, p.222, p.232).
- Row Number (305/405/505) runs across all body records in the file: starts at 1 and goes up by 1 for each B record, "regardless of how many different sections there might be in the body". "The last body record row number in the file must be equal to the total records supplied in the trailer." (p.215-216, p.223-224, p.232-233)
- UNCLEAR: p.204 and p.16 (5d). The BRS does not say whether the body is grouped by type (all RE, then all DE, then all DR) or nested (RE, then its DEs, each followed by its DRs). Structure check 5 rejects "records ... submitted in the incorrect sequence" (p.18), but the sequence itself is not defined beyond the table order RE, DE, DR.

Field counts in the live layout: GH 18 fields, SE 25, RE 29, DE 32, DR 10, T 4.

---

## 3. Record layouts

**Field order in the record.** The BRS says: "The number column is used to reference fields in the table for ease of use and does not indicate sequence in the file." (p.203, Note 1). The IT3(d) section gives no other statement of field order. UNCLEAR: p.203. The only evidence of order is the order in which fields are listed in the tables, which is ascending field number, with gaps (the header has no fields 11, 12, 13). The tables below are in that listed order. Confirm with SARS (for example by getting a sample file accepted in the test environment) before relying on it.

Field 1/201/301/401/501/601 is always the Section Identifier and the first value on the line (p.17, 5j).

All fields below are marked "B/R" (bulk and real time) except field 405, which is marked "B" only (p.223).

Abbreviations in the tables: Req = Required type; DT = Data type; LT = Length type.

### 3.1 Submission File Header, GH (6.5.1, p.205-209) — 18 fields

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 1 | Section Identifier | M | A | FIX | 1:1 | Must = H, where H = Header | |
| 2 | Header Type | M | A | VAR | 1:3 | Must = GH, where GH = General Header | |
| 3 | Message Create Date | M | FT | FIX | 19:19 | Format must be: CCYY-MM-DDThh:mm:ss. 24h time format must be used | Must be less than or equal to today's date |
| 4 | File Layout Version | M | N | VAR | 1:4 | Must = 1. Value must not contain a decimal point. "Note – SARS will only support the version(s) specified above" | Must be greater than or equal to 1 and less than or equal to 9999 |
| 5 | Unique File ID | M | AN | VAR | 1:64 | Value must not contain a decimal point. "Although this field is designed using the definition of AN ..., SARS will also accept dashes "-" (this is to cater for entities that have chosen to make use of a GUID). Please note this is the only exception to the AN definition that will be permitted and only on this field." | Must be unique per submission and across submissions per submitting entity |
| 6 | SARS Request Reference | O. Condition rule: "If Data Type Being Supplied = I3T, then this field must be left blank" | AN | VAR | 0:0 if left blank; 1:64 if completed | | |
| 7 | Test Data Indicator | M | A | FIX | 1:1 | Must = T or L, where T = Test and L = Live | "A test file with Field 7 = T will only be allowed in the test environment. A production file with Field 7 = L will only be allowed in the production environment." |
| 8 | Data Type Being Supplied | M | AN | FIX | 3:3 | Must = I3D, where I3D = IT3(d) supporting data | |
| 9 | Channel Identifier | M | AN | VAR | 1:10 | Must = CD or HTTPS, where CD = Connect Direct, HTTPS = Hypertext Transfer Protocol | |
| 10 | Source Identifier | M | FT | FIX | 144:144 | | Validate that this value = the value supplied by SARS. (Description: "This value will be supplied by SARS if the C:D or HTTPS channels are used." "For testing purposes please refer to the SARS website where a value will be supplied that can be used in the interim. This value will only be applicable for test purposes and will not be accepted in the production environment.") |
| 14 | Source System | M | FT | VAR | 1:30 | (Description: e.g. Pastel or SAP) | |
| 15 | Source System Version | M | FT | VAR | 1:10 | (e.g. 1.1.7.) | |
| 16 | Contact Person Name | M | FT | VAR | 1:100 | | |
| 17 | Contact Person Surname | M | FT | VAR | 1:120 | | |
| 18 | Business Telephone Number 1 | C. "At least one of Business Telephone Number 1 or the Cell Phone Number field must be completed" | AN | VAR | 0:15 no condition met; 9:15 condition met | Only numeric values are allowed. No spaces are allowed. + is not allowed. Value must not contain a decimal point | |
| 19 | Business Telephone Number 2 | O | AN | VAR | 0:0 if blank; 9:15 if completed | Same four rules as field 18 | |
| 20 | Cell Phone Number | C. Same rule as field 18 | AN | VAR | 0:15 no condition met; 9:15 condition met | Same four rules as field 18 | |
| 21 | Contact Email | M | FT | VAR | 5:80 | Must contain one @ sign. Must contain a domain which must be indicated with a dot (.) | |

Fields 11 (Group ID), 12 (Group Total) and 13 (Unique Group Item ID) exist in the IT3(b) header (p.24-26) but are not in the IT3(d) header: the IT3(d) table goes from 10 straight to 14 (p.208).

### 3.2 Submitting Entity, SE (6.5.2, p.210-214) — 25 fields

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 201 | Section Identifier | M | A | FIX | 1:1 | Must = H, where H = Header | |
| 202 | Header Type | M | A | VAR | 1:3 | Must = SE, where SE = Submitting Entity | |
| 203 | Submission Tax Year | M | N | FIX | 4:4 | Format CCYY | Must be greater than or equal to 2022 |
| 204 | Period Start Date | M | FT | FIX | 10:10 | Format CCYY-MM-DD | Date must fall within the Submission Tax Year |
| 205 | Period End Date | M | FT | FIX | 10:10 | Format CCYY-MM-DD | Date must fall within the Submission Tax Year |
| 206 | Nature of Person | M. Description: "Individuals as Submitting Entity will be allowed." | FT | VAR | 4:33 | Refer to Appendix A for code table | None live. **[DELETED in PDF]** "Value must not = INDIVIDUAL or FOREIGN_INDIVIDUAL or INDIVIDUAL_ESTATE" |
| 207 | Surname / Registered Name | M | FT | VAR | 1:120 | | |
| 208 | Initials | C. "If Nature of Person (Field 206) is INDIVIDUAL or FOREIGN_INDIVIDUAL or INDIVIDUAL_ESTATE, then Initials is Mandatory. Else field is NULL" | FT | VAR | 0:0 no condition met; 1:30 condition met | | |
| 209 | Names | C. Same rule as 208 ("then this field is Mandatory. Else field is NULL") | FT | VAR | 0:0 no condition met; 1:100 condition met | Names must be separated by a single space | |
| 210 | Trading name | O | FT | VAR | 1:120 | | |
| 211 | Identification Type | M | AN | FIX | 3:3 | Refer to Appendix G for code table | |
| 212 | Identification Number | M | FT | VAR | 1:30 | If Identification Type (Field 211) = 001, then refer to Appendix J for the ID validation that must be applied. If Identification Type (Field 211) = 004, then refer to Appendix K for the applicable validation that must be applied | |
| 213 | Passport Country of Issue | C. "If Identification Type (Field 211) = 003, then Passport Country of Issue is Mandatory. Else field is NULL" | AN | FIX | 0:0 no condition met; 2:2 condition met | Refer to Appendix F – Country Codes table | |
| 214 | Regulator Registration Number | O (e.g. FSCA registration number) | FT | VAR | 0:50 | | |
| 215 | Regulator Designation | C. "If Regulator Registration Number (Field 213) contains a value, then this field is Mandatory. Else field is Optional" (the BRS says Field 213 here; see open questions) | FT | VAR | 0:0 no value; 1:30 contains a value | | |
| 216 | Tax Reference Number | M | N | FIX | 10:10 | Refer to Appendix I - Modulus 10 Validation | Tax reference number can only start with 0, 1, 2, 3, 7 or 9 |
| 217 | Universal Branch Code | O | N | VAR | 0:6 | | |
| 218 | Postal address line 1 | M | FT | VAR | 1:100 | | |
| 219 | Postal address line 2 | O | FT | VAR | 0:100 | | |
| 220 | Postal address line 3 | O | FT | VAR | 0:100 | | |
| 221 | Postal address line 4 | O | FT | VAR | 0:100 | | |
| 222 | Postal code | M | ANS | VAR | 1:10 | | |
| 223 | Telephone Number | O | AN | VAR | 0:0 if blank; 9:15 if completed | Only numeric values are allowed. No spaces are allowed. + is not allowed. Value must not contain a decimal point. National numbers must start with 0. International numbers must start with 00 | |
| 224 | Cell Phone Number | M | AN | VAR | 9:15 | Same six rules as 223, plus: Insert "999999999999999" if no information available. | |
| 225 | Contact Email | M | FT | VAR | 5:80 | Must contain one @ sign. Must contain a domain which must be indicated with a dot (.). Insert "NO@EMAIL.COM" if no information available. | |

### 3.3 Reporting Entity, RE (6.5.3, p.214-221) — 29 fields. Mandatory 1:∞. "Section 18A Approved Entity / Donation Recipient (Usually non-profit organisation or Trust - cannot be an Individual)"

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 301 | Section Identifier | M | A | FIX | 1:1 | Must = B, where B = Body | |
| 302 | Record Type | M | AN | VAR | 1:6 | Must = RE, where RE = Reporting Entity | |
| 303 | Record Status | M | A | FIX | 1:1 | Record status can only be one of: N = New Record; C = Correction; D = Delete record. "N – Indicate a new record that has not been submitted before; C – Indicate that a previously submitted record is amended; D – Indicate that a previously submitted record must be deleted." | |
| 304 | Unique Number | M ("The taxpayer's system must generate a unique number for each record.") | FT | VAR | 1:100 | | If the record status (Field 303) = C or D, then this number must contain the number that was originally submitted. Must be unique within the section across all files |
| 305 | Row Number | M | N | VAR | 1:10 | An incrementing number per record beginning at 1 for each file | Must be greater than or equal to 1 and smaller than or equal to the total number of rows in the file with Section Identifier = B |
| 306 | Nature of Person | M | FT | VAR | 4:33 | Refer to Appendix A for code table | Value must ≠ INDIVIDUAL / FOREIGN_INDIVIDUAL / INDIVIDUAL_ESTATE / PARTNERSHIP / PUBLIC_CO / PRIVATE_CO / CLOSE_CORPORATION / FOREIGN_COMPANY / CORP_ESTATE / RETIREMENT_FUND / CLUB / STOKVEL / SOCIETY |
| 307 | Registered Name | M | FT | VAR | 1:120 | | |
| 308 | Trading name | M | FT | VAR | 1:120 | | |
| 309 | Registration Number | C. "If the value of Nature of person (Field 306) = INTERVIVOS_TRUST, then Registration Number is Mandatory. For any other Nature of person (Field 306), the field is Optional" | FT | VAR | 0:15 no condition met; 1:15 condition met | "If the value of Nature of person (Field 306) = PUBLIC_CO or PRIVATE_CO, then the following validation must be applied: Refer to Appendix K for the applicable validation that must be applied." | |
| 310 | Regulator Registration Number | O | FT | VAR | 0:50 | | |
| 311 | Regulator Designation | C. "If Regulator Registration Number (Field 310) contains a value, then this field is Mandatory. Else field is NULL" | FT | VAR | 0:0 no value; 1:30 contains a value | | |
| 312 | Tax Reference Number | M | N | FIX | 10:10 | Refer to Appendix I - Modulus 10 Validation | Tax reference number can only start with 0, 1, 2, 3, 7 or 9 |
| 313 | Exemption Reference Number | M. Description: 'Exemption Reference Number ("PBO Number") (SARS issues this number to the Reporting Entity - without this number entity can't have Section 18A)' | FT | VAR | 1:100 | | |
| 314 | Address Details - Physical: Unit number | O | AN | VAR | 0:8 | | |
| 315 | Address Details - Physical: Complex | O | FT | VAR | 0:27 | | |
| 316 | Address Details - Physical: Street Number | O | AN | VAR | 0:8 | | |
| 317 | Address Details - Physical: Street / Name of Farm | C. "At least one, Physical address or Postal address must be completed. If Reporting Entity Postal Address Line 1 is not completed this field is Mandatory" | FT | VAR | 0:27 no condition met; 1:27 condition met | | |
| 318 | Address Details - Physical: Suburb / District | C. "If Reporting Entity Address Details - Physical: Street/Name of Farm is completed this field is conditional – at least one the Suburb/ District field or the City/Town fields must be completed" | FT | VAR | 0:36 no condition met; 1:36 condition met | | |
| 319 | Address Details - Physical: City / Town | C. Same rule as 318 | FT | VAR | 0:36 no condition met; 1:36 condition met | | |
| 320 | Address Details - Physical: Postal Code | C. "If Reporting Entity Address Details - Physical: Street/Name of Farm is completed, this field is Mandatory. Else field is Optional" | ANS | VAR | 0:10 no condition met; 1:10 condition met | | Use "0000" if code is not available |
| 321 | Postal Address Line 1 | M | FT | VAR | 1:100 | | |
| 322 | Postal Address Line 2 | O | FT | VAR | 0:100 | | |
| 323 | Postal Address line 3 | O | FT | VAR | 0:100 | | |
| 324 | Postal Address Line 4 | O | FT | VAR | 0:100 | | |
| 325 | Postal code | C. "If Postal Address Line 1 (Field 321) is completed, then this field is Mandatory. Else field is Optional" | ANS | VAR | 0:10 no condition met; 1:10 condition met | | Use "0000" if code is not available |
| 326 | Telephone Number | O | AN | VAR | 0:0 if blank; 9:15 if completed | Only numeric values are allowed. No spaces are allowed. + is not allowed. Value must not contain a decimal point. National numbers must start with 0. International numbers must start with 00 | |
| 327 | Cell Phone Number | M | AN | VAR | 9:15 | Same six rules as 326, plus: Insert "999999999999999" if no information available | |
| 328 | Contact Email | M | FT | VAR | 5:80 | Must contain one @ sign. Must contain a domain which must be indicated with a dot (.). Insert "NO@EMAIL.COM" if no information available | |
| 329 | Null Declaration | M | A | FIX | 1:1 | Must = "Y" or "N", where "Y" Yes indicates that Donor Entity records will not be provided. "N" No it indicates that Donor Entity records will be provided | |

Nature of Person values not excluded by field 306's logic rule, by elimination against Appendix A (p.246): OTHER_CO, INTERVIVOS_TRUST, GOVERNMENT_ENTITY, UNINCORPORATED_BODY_OF_PERSONS, ASSOC_NOT_FOR_GAIN. The BRS does not say which of these a non-profit company or a PBO should use.

### 3.4 Donor Entity, DE (6.5.4, p.222-231) — 32 live fields. "Conditional Record: If Null Declaration (Field 329) = N Then one or more records must be provided (1:∞), Else If Null Declaration (Field 329) = Y Then No record must be provided (0:0)"

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 401 | Section Identifier | M | A | FIX | 1:1 | Must = B, where B = Body | |
| 402 | Record Type | M | AN | VAR | 1:6 | Must = DE, where DE = Donor Entity | |
| 403 | Record Status | M | A | FIX | 1:1 | N / C / D, same wording as 303 | |
| 404 | Unique Number | M | FT | VAR | 1:100 | | If the record status (Field 403) = C or D, then this number must contain the number that was originally submitted. Must be unique within the section across all files |
| 405 | Row Number | M (marked "B" only, not B/R) | N | VAR | 1:10 | An incrementing number per record beginning at 1 for each file | Must be greater than or equal to 1 and smaller than or equal to the total number of rows in the file with Section Identifier = B |
| 406 | I3D Unique Number | M ("IT3(d) unique number") | FT | VAR | 1:100 | | Must be equal to a Unique Number (Field 304) where Record Type = RE |
| 407 | Donor Surname / Registered Name | M | FT | VAR | 1:120 | | |
| 408 | Donor Initials | C. "If Donor Nature of Person (Field 417) is INDIVIDUAL or FOREIGN_INDIVIDUAL or INDIVIDUAL_ESTATE, then Donor Initials are Mandatory. Else field is NULL" | FT | VAR | 0:0 no condition met; 1:30 condition met | | |
| 409 | Donor Names | C. Same rule as 408 ("then this field is Mandatory. Else field is NULL") | FT | VAR | 0:0 no condition met; 1:100 condition met | Names must be separated by a single space | |
| 410 | Donor Trading name | O | FT | VAR | 0:120 | | |
| 411 | Donor Identification Type | M | AN | FIX | 3:3 | Refer to Appendix G for code table | **Must ≠ 009** |
| 412 | Donor Identification Number | M | FT | VAR | 1:30 | If Donor Identification Type (Field 411) = 001, then refer to Appendix J for the ID validation that must be applied. If Donor Identification Type (Field 411) = 004, then refer to Appendix K for the applicable validation that must be applied. **[DELETED in PDF]** the 009 / "NOIDNUMBER" rules | |
| 413 | Donor Passport Country of Issue | C. "If Donor Identification Type (Field 411) = 003, then Donor Passport Country of Issue is Mandatory. Else field is NULL" | AN | FIX | 2:2 condition met; 0:0 no condition met | Refer to Appendix F Country Codes Table | |
| 414 | Donor Income tax reference number | **CW**. "If Donor Identification Type (Field 411) = 001, 004 or 007 then this field is Mandatory. Else field is Optional" | N | FIX | 0:0 if blank; 10:10 if completed | Modulus 10 check for IT reference number. Refer to Appendix I for the modulus 10 check. The first character can only be 0, 1, 2, 3, or 9 | |
| 415 | Donor Date of Birth | C. "If Doner Identification Type (Field 411) = 001 or 003, then Donor Date of Birth is Mandatory. Else field is Optional" | FT | FIX | 0:10 no condition met; 10:10 condition met | Format CCYY-MM-DD. Date must not be greater than the current date. **[DELETED in PDF]** "If no data available, then insert '0001-01-01'" | |
| ~~416~~ | ~~Donor South African resident for tax purposes indicator~~ | **[DELETED in PDF]** whole field struck through (p.226-227). Do not output it. | | | | | |
| 416 | Donor Number | O. "Number assigned by Reporting Entity to identify a regular Donor Entity as registered with them. This number is used by the Donor Entity when interacting with the Reporting Entity." | AN | VAR | 0:30 | | |
| 417 | Donor Nature of person | M | FT | VAR | 4:33 | Refer to Appendix A for code table | |
| 418 | Donor Address Details - Physical: Unit number | O | AN | VAR | 0:8 | | |
| 419 | Donor Address Details - Physical: Complex | O | FT | VAR | 0:27 | | |
| 420 | Donor Address Details - Physical: Street Number | O | AN | VAR | 0:8 | | |
| 421 | Donor Address Details - Physical: Street/Name of Farm | C. "At least one, Physical address or Postal address must be completed. If Donor Postal Address Line 1 is not completed this field is Mandatory" | FT | VAR | 0:27 no condition met; 1:27 condition met | | |
| 422 | Donor Address Details - Physical: Suburb / District | C. "If Donor Address Details - Physical: Street / Name of Farm is completed this field is Conditional – at least one the Suburb / District field or the City /Town fields must be completed" | FT | VAR | 0:36 no condition met; 1:36 condition met | | |
| 423 | Donor Address Details - Physical: City / Town | C. Same rule as 422 | FT | VAR | 0:36 no condition met; 1:36 condition met | | |
| 424 | Donor Address Details - Physical: Postal Code | C. "If Donor Address Details - Physical: Street/Name of Farm is completed, this field is Mandatory" | ANS | VAR | 0:10 no condition met; 1:10 condition met | | Use "0000" if code is not available |
| 425 | Donor Postal Address Line 1 | C. "At least one Physical address or Postal address field must be completed. If Donor Address Details - Physical: Street / Name of Farm is not completed this field is Mandatory" | FT | VAR | 0:100 no condition met; 1:100 condition met | | |
| 426 | Donor Postal Address Line 2 | O | FT | VAR | 0:100 | | |
| 427 | Donor Postal Address Line 3 | O | FT | VAR | 0:100 | | |
| 428 | Donor Postal Address Line 4 | O | FT | VAR | 0:100 | | |
| 429 | Donor Postal Code | C. "If Donor Postal Address Line 1 is completed this field is Mandatory. Else field is Optional" | ANS | VAR | 0:10 no condition met; 1:10 condition met | | Use "0000" if code is not available |
| 430 | Telephone Number | O | AN | VAR | 0:0 if blank; 9:15 if completed | Only numeric values are allowed. No spaces are allowed. + is not allowed. Value must not contain a decimal point. National numbers must start with 0. International numbers must start with 00 | |
| 431 | Cell Phone Number | M | AN | VAR | 9:15 | Same six rules as 430, plus: Insert "999999999999999" if no information available. | |
| 432 | Contact Email | M | FT | VAR | 5:80 | Must contain one @ sign. Must contain a domain which must be indicated with a dot (.). Insert "NO@EMAIL.COM" if no information available. | |

### 3.5 Donation Record, DR (6.5.5, p.231-234) — 10 fields. "(e.g. monthly donations one receipt for year, or money + physical goods) (Mandatory: For each Donor Entity record there should be 1:∞ Donation record(s) supplied)"

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 501 | Section Identifier | M | A | FIX | 1:1 | Must = B, where B = Body | |
| 502 | Record Type | M | AN | VAR | 1:6 | Must = DR, where DR = Donation Record | |
| 503 | Record Status | M | A | FIX | 1:1 | N / C / D, same wording as 303 | |
| 504 | Unique Number | M | FT | VAR | 1:100 | | If the record status (Field 503) = C or D, then this number must contain the number that was originally submitted. Must be unique within the section across all files |
| 505 | Row Number | M | N | VAR | 1:10 | An incrementing number per record beginning at 1 for each file. Value must not contain a decimal point | Must be greater than or equal to 1 and smaller than or equal to the total number of rows in the file with Section Identifier = B |
| 506 | I3D Unique Number | M ("IT3(d) unique Donor Entity number") | FT | VAR | 1:100 | | Must be equal to a Unique Number (Field 404) where Record Type = DE |
| 507 | Receipt Number | M. "Receipt Number (Internal Number for Audit purposes - SIC Number)" | FT | VAR | 1:100 | | |
| 508 | Nature of Donation | M. "(Cash, In Specie)" | A | VAR | 1:10 | Nature of Donation can only be: CASH; IN SPECIE | |
| 509 | Date Paid / Transferred | M | FT | FIX | 10:10 | Format CCYY-MM-DD | Date must fall within the Submission Tax Year |
| 510 | Rand Value of Donation | M | N | VAR | 4:18 | If 1.00 or greater, no leading zeros allowed. If <1.00, there must be a single zero before the decimal. Must be greater than or equal to 0.00 and smaller than or equal to 999999999999999.99. Must always have 2 values after the point to denote cent | |

Amount format, as these rules read: rand with a full stop as decimal separator and exactly two decimals, no thousands separator, no currency sign; for example `1250.00`, `34.57`, `0.50`. Minimum length 4 (`0.00`). Negative values: `N` allows a minus sign, but field 510 must be ≥ 0.00.

There is no receipt-date field, no donation-type code list beyond CASH / IN SPECIE, and no per-donor total field in the IT3(d) layout. A DR carries one Nature of Donation, so a gift that is "money + physical goods" (the example in the heading) would be two DR records. That is a reading of the heading, not a stated rule.

### 3.6 File Trailer, T (6.5.6, p.234-235) — 4 fields

| No | Field name | Req and condition rule | DT | LT | Length | Data validations | Logic validations |
|---|---|---|---|---|---|---|---|
| 601 | Section Identifier | M | A | FIX | 1:1 | Must = "T" | |
| 602 | Total Number of Records | M. "This is the sum of all records contained in the body of the delimited file. This sum excludes the header and the trailer records" | N | VAR | 1:15 | Value must not contain a decimal point | Must be greater than or equal to 1 and less than or equal to 999999999999999. Must be equal to the total of all lines with a section identifier of B |
| 603 | File Hash Total | **MW**. "Calculation based on all the characters in the file. Must use MD5 calculation." | AN | FIX | 32:32 | | Must use MD5 calculation. Use all sections, except those where the section identifier = T. File hash total calculation must equal this field value. "Note – If you do not provide this field, the file will be accepted with warning, however SARS will not be able to confirm the integrity of the contents of the file submitted." |
| 604 | Sum of all monetary fields | M | N | VAR | 4:33 | No leading zeros allowed. Must be greater than or equal to 0.00 and smaller than or equal to 999999999999999999999999999999.99. Must always have 2 values after the point to denote cent. Allow negative and positive values. For negative values, the – sign must display before the value | Must be greater than or equal to 0.01 and smaller than or equal to 999999999999999999999999999999.99. The value of this field must be equal to the sum of all values entered into the following fields: Rand Value of Donation (Field 510). |

How the trailer values are calculated (from the rules above):
- 602 = number of lines whose Section Identifier is `B` (all RE + DE + DR records). Equals the last Row Number.
- 603 = MD5 of "all sections, except those where the section identifier = T", that is the H (GH and SE) lines and B lines. UNCLEAR: p.234 and p.268-270. The BRS does not say whether line terminators are included, which byte encoding is hashed (presumably the file's Latin-1 bytes), or whether the 32-character hex digest is upper or lower case.
- 604 = sum of every field 510 in the file, two decimals.

There are no other totals (no total per RE or per donor) in the IT3(d) trailer.

---

## 4. Appendices needed for IT3(d)

### 4.1 Appendix A – Nature of Person (p.246)

| Code | Description |
|---|---|
| INDIVIDUAL | Individual |
| FOREIGN_INDIVIDUAL | Foreign Individual |
| INDIVIDUAL_ESTATE | Individual Estates (including late Estates) |
| PARTNERSHIP | Partnerships |
| PUBLIC_CO | Listed company |
| PRIVATE_CO | Unlisted company |
| CLOSE_CORPORATION | Close Corporation |
| FOREIGN_COMPANY | Foreign Company |
| OTHER_CO | Other Company |
| CORP_ESTATE | Corporate: Estate / Liquidation |
| INTERVIVOS_TRUST | Trust (any type) |
| GOVERNMENT_ENTITY | RSA Government, Provincial Administration, Municipalities |
| RETIREMENT_FUND | Retirement Fund (Pension, Provident, Benefit, RA etc) |
| CLUB | Clubs |
| UNINCORPORATED_BODY_OF_PERSONS | Other entity not covered by the list provided (including a portfolio of a Collective Investment Scheme in Securities) |
| ASSOC_NOT_FOR_GAIN | Association not for gain |
| STOKVEL | Stokvel |
| SOCIETY | Society |

### 4.2 Appendix F – Country Codes (p.258-262)
"The Country Codes are aligned with the ISO3166 standard." Table "New ISO3166 Country Codes": country name and two-letter alphabetic code, upper case, e.g. Afghanistan AF, Åland Islands AX, Albania AL ... **South Africa ZA** ... Zambia ZM, Zimbabwe ZW, and a final row **Other XX**. The full list is on p.258-262 (text lines ~10514-10790 of brs.txt). Used by fields 213 and 413 (AN FIX 2:2).

### 4.3 Appendix G – Identification Type Code Table (p.263)

| Code | Description |
|---|---|
| 001 | South African ID number |
| 002 | Foreign ID number |
| 003 | Foreign Passport number |
| 004 | South African company/ close corporation registration number |
| 005 | Foreign company registration number |
| 007 | South African trust registration number |
| 008 | Foreign trust registration number |
| 009 | Internal identification number (not allowed for donors: field 411 "Must ≠ 009") |

There is no code 006.

### 4.4 Appendix H – File Response Codes (p.263)

| Code | Description |
|---|---|
| 001 | Acknowledgement of receipt |
| 002 | Rejected: Entire file rejected as contains critical errors. The file must be corrected and resubmitted to enable processing |
| 003 | Successfully uploaded: all records accepted and processed. |
| 004 | Accepted with warnings: This can be any combination of accepted fields, fields accepted with a warning and duplicate records. |
| 005 | Rejected: Entire file rejected as it contains file structure errors. The file must be corrected and resubmitted to enable processing. |
| 006 | Partial upload: This can be any combination of accepted fields, rejected fields, fields accepted with a warning or duplicate records. |
| 011 | Rejected: Entire file rejected as the file was submitted as part of a group and one or more of the files in the group failed the validations associated with the submission of a file as part of a group. |
| 012 | Rejected: Group submission incomplete and service level agreement expired for SARS to wait for all files in a group to be submitted |

### 4.5 Appendix I – Modulus 10 Validation, 7.10.1 Income Tax and Value Added (p.264)
Used by fields 216, 312, 414.

"The last character is a check digit, calculated by applying the following algorithm:"

| Digit | Formula |
|---|---|
| Digit 1 | Multiply by 2 (Add result to total)* |
| Digit 2 | Add to total |
| Digit 3 | Multiply by 2 (Add result to total)* |
| Digit 4 | Add to total |
| Digit 5 | Multiply by 2 (Add result to total)* |
| Digit 6 | Add to total |
| Digit 7 | Multiply by 2 (Add result to total)* |
| Digit 8 | Add to total |
| Digit 9 | Multiply by 2 (Add result to total)* |

"* When the result of the line item calculation exceeds 9, add the individual digits together to obtain a single digit result (e.g. 18 = 1+ 8 = 9)"

"Digit 10: Check digit. If the last digit of Total > 0 Then The Check Digit should be equal to the result of 10 – (Total MOD 10). If the last digit of Total = 0 Then The Check Digit should be equal to zero"

Example: Tax Reference Number = 0001339050. 0x2=0, +0, 0x2=+0, +1, 3x2=+6, +3, 9x2=18 (1+8=9) +9, +0, 5x2=10 (1+0=1) +1. Total 20. "Last Digit of Total is not greater than zero 0 so the check digit equal 0 and the number is therefore valid."

(7.10.2 Pay As You Earn, p.264-265, is a different algorithm: replace character 1 with a 4, then the same doubling, then check digit = right-most digit of 90 minus Total. It is not referenced by any IT3(d) field.)

### 4.6 Appendix J – ID Validation (p.266)
Used by fields 212 and 412 when ID type = 001.

"Format: {YYMMDD}{G}{SSS}{C}{A}{Z}
YYMMDD : Date of birth.
G : Gender. 0-4 Female; 5-9 Male.
SSS : Sequence No. for DOB/G combination.
C : Citizenship. 0 SA; 1 Other.
A : Usually 8, or 9 [can be other values]
Z : Control digit"

"Formula to calculate the check digit for a 13 digit identity number: ... the control figure which is the 13th digit of all identity numbers which is calculated as follows using ID Number 800101 5009 087 as an example:
Add all the digits in the odd positions (excluding last digit). 8 + 0 + 0 + 5 + 0 + 0 = 13 ...[1]
Move the even positions into a field and multiply the number by 2. 011098 x 2 = 22196
Add the digits of the result in b). 2 + 2 + 1 + 9 + 6 = 20 ...[2]
Add the answer in [2] to the answer in [1]. 13 + 20 = 33
Subtract the second digit (i.e. 3) from 10. The number must tally with the last number in the ID Number. If the result is 2 digits, the last digit is used to compare against the last number in the ID Number. If the answer differs, the ID number is invalid"

### 4.7 Appendix K – Company registration number validation (p.267)
Used by fields 212 and 412 when ID type = 004, and by field 309 when Nature of Person = PUBLIC_CO or PRIVATE_CO.

"CCYY/NNNNNN/NN, where the CCYY must be validated to be from 1800 and up and including the current calendar year. The last two digits of this number must be validated to be either of the following: 06, 07, 08, 09, 10, 11, 20, 21, 22, 23, 24, 25, 26, 30, 31"

### 4.8 Appendix L – MD5 Calculation (p.268-270)
"The following calculation must be used for determining the file hash total." The appendix then reproduces the standard MD5 algorithm (RFC 1321) from Wikipedia: per-round shift amounts r[0..63], constants k[i] = floor(abs(sin(i + 1)) × 2^32), initial h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, padding with a 1 bit, 0 bits to 448 mod 512 and a 64-bit little-endian bit length, 64 operations per 512-bit chunk, digest = h0 h1 h2 h3 little-endian. "Source: http://en.wikipedia.org/wiki/MD5". A standard MD5 library gives the same result.

What is hashed comes from field 603 only (p.234): "Calculation based on all the characters in the file" and "Use all sections, except those where the section identifier = T." Appendix L does not say more. UNCLEAR: p.234 and p.268-270 (line terminators in or out, byte encoding, hex case; see 3.6).

### 4.9 Appendix M – Response Codes, per field (p.271)

| Code | Description |
|---|---|
| 001 | Mandatory field left blank – Mandatory field does not contain a value. |
| 002 | Incorrect field length – Field length does not comply with the specification. |
| 003 | Incorrect field format – Field format does not comply with the specification. |
| 004 | Invalid field value – Field can only have a defined set of values. The value supplied in the field does not appear in the defined set of values. |
| 005 | Invalid Logic – Field value does not meet a logic rule i.e. A + B must be equal to this field or Field does not pass Mod 10 test |
| 006 | SARS System Rejection – Field failed because it does not meet a data or business rule requirement within a SARS system i.e. Tax Reference number does not exist |
| 500 | Duplicate Record already existing |

### 4.10 Response file (6.6, p.236-245), short note
SARS sends a PSV response file with a header (6.6.1), and a body and trailer only "if File Response Code = 004, 005 or 006" (6.6.2, 6.6.3). Its header field 4 File Layout Version "Must = 3" (p.237) and field 13 File Response Code uses Appendix H (p.240). Its field 8 Data Type list reads "Must = I3B, I3Cor I3E ... and I3S" and does not list I3D (p.238). See open questions.

---

## 5. Submitting through eFiling (from the guide, GEN-ENR-01-G03 Rev 6, effective 7 April 2026)

### Submission periods and due dates
- The only statement on periods: "Submitting entities are required to submit IT3 data/certificates in a bi-annual and annual submission cycle." (Guide p.3, 2a)
- Neither the guide nor the BRS states IT3(d) submission periods or due dates. The BRS only requires Period Start and End Dates (204, 205) to "fall within the Submission Tax Year" (p.210), Submission Tax Year ≥ 2022 (p.210), and Date Paid / Transferred (509) to fall within the Submission Tax Year (p.234). The guide's eFiling form says "Do note that the Period start and end date must fall within the Year of Assessment submission" (Guide p.15).
- The guide shows "Submission Period: 1 March + 31 August / 1 March + 28/29 February" only on the IT3(e) form (Guide p.27-28). It is not stated for IT3(d).
- Who must report: "section 18A requires that Entities who received donations and issued receipts to Donors are to report those receipts to SARS. This implies that where a receipt was issued, it should be reported to SARS." Listed: Government; Government Institutions (e.g. Public Schools); Public Benefit Organisations; United Nations Agencies. (Guide p.4, 3a)
- "Although certain section 18A entities will be specified in the appropriate Gazette to make data submission, a value or volume threshold may be applied to ask for data submissions. Furthermore, where entities didn't receive any Donations, a "NIL reporting declaration" is required." (Guide p.4, 3b)

### Which channel, by volume (Guide p.4, 4b-4c)
- "Connect Direct is recommended for large-scale data submissions."
- "HTTPS should be used for medium-sized data submissions."
- "eFiling is suitable for submitting the IT3-01 form, with a maximum limit of 20 certificates." But for IT3(d): "Note that the number of certificates is limited to 20. However, for IT3(d) the number of certificates is limited to 50." (Guide p.14, 8.2.1)
- "Entities submitting up to 20 certificates are required to complete and submit the IT3-01 form via eFiling. For submissions exceeding 20 certificates, electronic or data file submission is mandatory. Certificate data must be structured according to the specifications outlined in the External BRS document. Once the file has been correctly formatted, it should be uploaded and submitted through either the HTTPS or Connect Direct platforms." (Guide p.4, 4c)
- "Note that if your data has been submitted through secure channels, submission of the IT3-01 form is not required." (Guide p.11)
- BRS agrees: field 9 Channel Identifier "Must = CD or HTTPS" (p.207). There is no eFiling value. Field 10 Source Identifier (144 characters) is "supplied by SARS if the C:D or HTTPS channels are used" (p.208).

### Can a small organisation upload a file it made elsewhere through eFiling?
Neither document describes uploading a data file through the eFiling website. eFiling takes the IT3-01 form, captured field by field (up to 50 IT3(d) certificates). A data file goes through HTTPS or Connect Direct, which need enrolment and activation for third-party data on eFiling and a SARS-issued Source Identifier. "Submitting a data file is permitted only when the organisation is both enrolled and activated for Third-Party data submission on eFiling." (Guide p.5, 5a). The HTTPS and Connect Direct steps are in separate guides that were not supplied: GEN-ENR-01-10 (Manage Submission of IT3 Third-Party Data), GEN-ENR-01-G01 (Connect Direct) and GEN-ENR-01-G02 (HTTPS) (Guide p.5). Nothing in either document stops a file generated by other software (for example Givezy) from being sent on HTTPS by an enrolled submitting entity. Who may act as Submitting Entity is open: the SE row allows "Tax Practitioner, Individual or general entity that works with a power of attorney etc" (p.204), and one file can hold many Reporting Entities (RE 1:∞, p.204).

### Steps on eFiling
1. Prerequisite: "your organisation's tax representative is duly registered with SARS as the official representative. Furthermore, the registered tax representative must be appropriately linked to the organisation's profile on eFiling." A first-time representative registration "should be resolved within 21 business days". (Guide p.5-6, 6c-6d)
2. Activate the IT3 tax type (covers IT3(b), (c), (d), (e), (s), (t)): Organisations > Organisation > Tax Types > Manage Tax Type, select the product, Submit, Continue. (Guide p.5-7, 6b, 6e-6j)
3. Rights groups: Organisations > Rights Group > Manage Groups > Open > select the IT3 option > Update. "this step will ensure that the Third-Party Data functionality is activated on your eFiling profile." (Guide p.9-10, 7)
4. Submit data, either:
   - by file through HTTPS or Connect Direct (separate guides), or
   - for small volumes, on the IT3-01 form: Returns > Third Party Data > Submit New Data > IT3 > choose the period > Capture New Data > open the IT3 form > Certificate Details: choose IT3(d) and the number of certificates (max 50 for IT3(d)) > complete Submitting Entity, Reporting Entity (physical and postal address, Null Declaration), Donor Entity, Donation Record (Receipt Number, Nature of Donation Cash or In Specie, Rand Value, Date Paid / Transferred) > Submit. (Guide p.10-14, 24-27, 31)
   - "where Partial upload is the Submission Status, this indicates that the IT3 form has been submitted however it is not completed correctly. Thus, it is not accepted by SARS." (Guide p.32)
5. Declare on the IT3-02 return: Returns > Third Party Data > Submit New Return > IT3 > choose the data type (e.g. IT3(d)), date and period > Request Return > open the IT3 hyperlink > check the pre-populated summary > Submit. "Do note that there is a time delay when the submitted data is being processed to the IT3-02 declaration form." If there is no data: "No data found for Data Type IT3..., Tax Reference Number xxxxxxx and Tax Year xxxx". If figures are wrong: "resubmit your IT3-01 by selecting the "Request Tax Transactions" functionality or submit the correct data online via the secure channels." (Guide p.33-35, 11). The BRS adds that the IT3-02 is done at Submitting Entity level, not per Reporting Entity (p.204, Note 7).
6. Corrections and deletions on eFiling: Returns > Third Party Data > Request Tax Transactions > IT3 > tax year, certificate type, Unique Reference Number > Continue > set Record Status to correction or deletion. (Guide p.36-39, 13). In a file, the same is done with Record Status C or D and the original Unique Number (p.214-215).
7. Dashboard: Third Party Data > Dashboard > IT3. (Guide p.40, 14)

### Test vs live
BRS field 7: "A test file with Field 7 = T will only be allowed in the test environment. A production file with Field 7 = L will only be allowed in the production environment." (p.206-207). Field 10: a test Source Identifier is published on the SARS website and "will not be accepted in the production environment" (p.208). The guide does not describe a test environment.

### Support
Technical queries: SARS_ThirdPartyData_Support@sars.gov.za (Guide p.5, 5b). SARS Contact Centre 0800 00 SARS (7277) (Guide p.40).

---

## 6. Open questions and ambiguities

1. **Field order within a record.** "The number column ... does not indicate sequence in the file" (p.203) and no other order is given. Table order is the only evidence. Confirm with SARS or a test submission.
2. **Body record order.** Grouped (all RE, all DE, all DR) or nested (RE, its DEs, each DE's DRs)? Not defined (p.16, p.18 check 5, p.204).
3. **Line ending.** "a carriage return" only (p.17). CR, CRLF or LF not stated. Also unstated whether the trailer line ends with one.
4. **MD5 input.** Which bytes: with or without line terminators, which encoding, hex case (p.234, p.268-270). Field is MW, so a missing hash is "accepted with warning" (p.234-235).
5. **File name tax reference.** Pattern says "value of field 28" (p.20); IT3(d) has no field 28. Presumably field 216 (Submitting Entity tax reference), but not stated.
6. **Field 215 condition** refers to "Regulator Registration Number (Field 213)" (p.212-213); field 213 is Passport Country of Issue. Field 214 is the Regulator Registration Number.
7. **Field 6 condition** "If Data Type Being Supplied = I3T, then this field must be left blank" (p.206) mentions I3T, not I3D. For I3D the field is O.
8. **Field 309** logic applies Appendix K when Nature of Person = PUBLIC_CO or PRIVATE_CO (p.217), but field 306 forbids those values for a Reporting Entity (p.216). Registration Number is only mandatory for INTERVIVOS_TRUST.
9. **Reporting Entity Nature of Person for a non-profit company or PBO** is not mapped. Allowed values by elimination: OTHER_CO, INTERVIVOS_TRUST, GOVERNMENT_ENTITY, UNINCORPORATED_BODY_OF_PERSONS, ASSOC_NOT_FOR_GAIN (p.216, p.246).
10. **Donor ID type 009 is forbidden** (411 "Must ≠ 009", p.225) and the "NOIDNUMBER" fallback was deleted. Field 412 is M 1:30. How to report a donor with no ID, passport or registration number is not stated.
11. **Donor Date of Birth** is mandatory for ID type 001 or 003 and the "0001-01-01" fallback was deleted (p.226). No rule for an unknown date of birth.
12. **Nature of Donation** is data type A ("Alphabet A until Z only", p.8) but one allowed value is "IN SPECIE", which has a space (p.233-234). Send exactly `IN SPECIE` as listed, but SARS's data type check may treat it differently.
13. **Trailer 604 with no donations.** Data validation allows ≥ 0.00 but the logic validation says "Must be greater than or equal to 0.01" (p.235). A file where every RE has Null Declaration = Y (a nil return) has no DR records, so the sum is 0.00 and would fail. How to send a nil IT3(d) file is not stated. The guide only says a "NIL reporting declaration" is required (Guide p.4).
14. **Submission Tax Year meaning.** Field 203 is CCYY, ≥ 2022 (p.210). Whether "2027" means the year of assessment 1 March 2026 to 28 February 2027 is not defined in the BRS.
15. **IT3(d) submission periods and due dates** are not stated in the BRS or the guide (only "bi-annual and annual submission cycle", Guide p.3). The IT3(e) form's "1 March + 31 August / 1 March + 28/29 February" periods (Guide p.27) are not stated for IT3(d).
16. **Response file data type** list (p.238) does not include I3D, and the response file header version "Must = 3" (p.237) while the submission header version "Must = 1" (p.205).
17. **Channel.** BRS section 6 lists "3rd Party application / eFiling" as a sender (p.20) and Note 4 says Bulk covers "eFiling, HTTPS or C:D" (p.203), but field 9 only allows CD or HTTPS (p.207). File upload through the eFiling website is not described in either document.
18. **Certificate limit on eFiling.** Guide p.4 says 20; Guide p.14 says 50 for IT3(d).
19. **Field 18 and 20 lengths** "0:15 – No condition met" (p.209): the length when the condition is not met is 0:15 rather than 0:0.
20. **Field 405** is marked "B" only while every other IT3(d) field is "B/R" (p.223). Probably no effect on bulk files.
21. **"Mandatory with warning" period.** MW (603) and CW (414) revert to M/C "at the applicable time" (p.16, p.203). The date is not stated.
22. **Unique File ID characters.** Field 5 is AN plus dashes (p.205-206); underscores are not allowed, which matters because the file name uses underscores as separators (p.20).
23. **Validation order clash.** p.17 (5k) says field errors in the header or trailer reject the whole file. Field 603 is the exception: a missing hash is "accepted with warning" (p.234).
