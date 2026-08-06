/**
 * Compatibility facade — prefer DispenseMedicationUseCase from pharmacy module.
 */
export {
  DispenseMedicationUseCase as PharmacyDispenseService,
  PHARMACY_EVENTS,
  type DispenseLine,
} from '../pharmacy/use-cases/dispense-medication.usecase';
