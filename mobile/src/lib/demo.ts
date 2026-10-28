import type { DecodeResult } from "./api";

// Deliberate fixtures, never represented as OCR output or medical advice.
export const demoResult: DecodeResult = {
  hospital: "Demo Care Clinic",
  doctor: "Dr. Sample",
  engine: "demo",
  review_required: false,
  medicines: [
    {
      name: "Paracetamol",
      strength: "500 mg",
      dosage: "1 tablet",
      frequency: "Twice daily",
      duration_days: 3,
      instruction: "After food",
      original: "",
      model: "",
      printed: "",
    },
    {
      name: "Cetirizine",
      strength: "10 mg",
      dosage: "1 tablet",
      frequency: "At bedtime",
      duration_days: 5,
      instruction: "At night",
      original: "",
      model: "",
      printed: "",
    },
    {
      name: "Vitamin C",
      strength: "500 mg",
      dosage: "1 tablet",
      frequency: "Once daily",
      duration_days: 7,
      instruction: "After breakfast",
      original: "",
      model: "",
      printed: "",
    },
  ],
};
