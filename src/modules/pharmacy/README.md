# Pharmacy module

Owns pharmacy dispense stock integrity against `db.sql` schema `pharmacy.*`.

## Critical use case: `DispenseMedicationUseCase`

FEFO dispense for a visit:

1. Idempotent check (`stock_movements` for VISIT + DISPENSE)
2. `$transaction`
3. Resolve medications (single formulary query — no N+1)
4. Conditionally decrement `batches.quantity_on_hand` (`updateMany` where `gte`)
5. Insert `stock_movements` with negative quantity

Billing / visits call this via the compatibility alias `PharmacyDispenseService`.

## Events

`pharmacy.medicine.dispensed`

## Tests

```bash
yarn jest src/modules/pharmacy/__tests__/dispense-medication.usecase.spec.ts
```
