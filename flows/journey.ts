import type { PageObjects } from '@page-objects';
import type { JourneyOptions } from '@domain/constants/journey-options';
import { getRelativeAppDateText } from '@utils/date-utils';

export type JourneyContext = {
  journeyId?: string;
  referenceNumber?: string;
  declarationDate?: string;
};

/** Which address-book records the journey picks for its parties. Every role
 * defaults to a shared fixture; name one here to pick a record the spec owns,
 * which a spec must do before editing or deleting the address it picked. */
export type AddressChoices = {
  consignor?: string;
};

const COUNTRY = 'France';
const PORT = 'Aberdeen Harbour (GB ABD)';
// Inside the arrival-date window (1 week back to 6 months ahead) wherever the
// wall clock happens to be, in the unpadded d/m/yyyy the app itself renders —
// so a CYA assertion compares against the app's shape, not the typed string it
// happens to echo back.
export const ARRIVAL_DATE = getRelativeAppDateText({ monthOffset: 1 });

export class Journey {
  constructor(
    private readonly pages: PageObjects,
    private readonly context: JourneyContext,
  ) {}

  async toSignIn(open: (attemptSignIn: boolean) => Promise<void>): Promise<void> {
    await open(false);
  }

  async toNotificationDashboard(): Promise<void> {
    await this.pages.notificationDashboard.open();
    await this.pages.notificationDashboard.heading.waitFor();
  }

  private async createNotificationAtOrigin(): Promise<string> {
    await this.toNotificationDashboard();
    await this.pages.notificationDashboard.btnCreateNewNotification.click();
    await this.pages.originOfImport.heading.waitFor();
    const journeyId = this.pages.originOfImport.journeyIdFromUrl();
    this.context.journeyId = journeyId;
    this.context.referenceNumber = journeyId;
    return journeyId;
  }

  // Origin is the journey entry: the entry guard holds a new notification there
  // until it is answered, so reaching the overview means answering it.
  async startNotification(): Promise<string> {
    const journeyId = await this.createNotificationAtOrigin();
    await this.fillOriginOfImport();
    await this.saveOriginOfImport();
    await this.pages.overview.open(journeyId);
    await this.pages.overview.heading.waitFor();
    return journeyId;
  }

  // Origin unanswered, as a brand-new notification first shows it.
  async toOriginOfImport(): Promise<void> {
    await this.createNotificationAtOrigin();
  }

  async fillOriginOfImport(options: JourneyOptions = {}): Promise<void> {
    await this.pages.originOfImport.selectCountry(COUNTRY);
    const requiresRegionCode = options.requiresRegionCode ?? 'No';
    await this.pages.originOfImport.radioRequiresOriginCode(requiresRegionCode).check();
    if (requiresRegionCode === 'Yes') {
      await this.pages.originOfImport.regionCode.fill('FR-75');
    }
    if (options.internalReference) {
      await this.pages.originOfImport.internalReference.fill(options.internalReference);
    }
  }

  async saveOriginOfImport(): Promise<void> {
    await this.pages.originOfImport.saveAndContinue.click();
  }

  async answerOrigin(options: JourneyOptions = {}): Promise<void> {
    await this.pages.overview.task('Where is this consignment coming from?').click();
    await this.fillOriginOfImport(options);
    await this.saveOriginOfImport();
    await this.pages.overview.heading.waitFor();
  }

  async answerCommodity(): Promise<void> {
    await this.pages.overview.task('What are you importing?').click();
    await this.pages.commoditySelection.selectSpecies(['Bos taurus']);
    await this.pages.commoditySelection.saveAndContinue.click();
    await this.pages.consignmentDetails.heading.waitFor();
    await this.pages.consignmentDetails.numberOfAnimals.fill('1');
    await this.pages.consignmentDetails.numberOfPackages.fill('5');
    await this.pages.consignmentDetails.saveAndContinue.click();
    await this.pages.overview.heading.waitFor();
  }

  async answerAnimalIdentification(): Promise<void> {
    await this.pages.overview.task('Animal identification details').click();
    await this.pages.animalIdentification.earTag.fill('UK123456789012');
    await this.pages.animalIdentification.saveAndFinish.click();
    await this.pages.overview.heading.waitFor();
  }

  async answerReasonAndAdditionalDetails(): Promise<void> {
    await this.pages.overview.task('Main reason for importing').click();
    await this.pages.importReason.reason('Internal market').check();
    await this.pages.importReason.saveAndContinue.click();
    await this.pages.importPurpose.heading.waitFor();
    await this.pages.importPurpose.purpose('Breeding').check();
    await this.pages.importPurpose.saveAndContinue.click();
    await this.pages.additionalDetails.heading.waitFor();
    await this.pages.additionalDetails.certifiedFor('Slaughter').check();
    await this.pages.additionalDetails.containsUnweanedAnimals('No').check();
    await this.pages.additionalDetails.saveAndContinue.click();
    await this.pages.overview.heading.waitFor();
  }

  async unlockSections(): Promise<void> {
    await this.answerCommodity();
  }

  async toAccompanyingDocuments(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.pages.overview.task('Uploaded documents').click();
    await this.pages.accompanyingDocuments.heading.waitFor();
  }

  /** `consignor` picks a different record for the consignor role than the shared
   * fixture. A spec that edits or deletes the address it picked must own that
   * record — the fixtures are shared with every spec running alongside it. */
  async fillAddressesToCph({ consignor }: AddressChoices = {}): Promise<void> {
    await this.pages.overview.task('Roles and addresses').click();
    const parties = [
      ['Consignor or exporter', 'Astra Rosales', 'consignorSelection'],
      ['Place of destination', 'Tech Imports Ltd', 'destinationSelection'],
      ['Place of origin', 'Origin Farm', 'placeOfOriginSelection'],
      ['Consignee', 'British Livestock Ltd', 'consigneeSelection'],
      ['Importer', 'Import Co UK', 'importerSelection'],
    ] as const;
    for (const [role, name, picker] of parties) {
      const chosen = picker === 'consignorSelection' ? (consignor ?? name) : name;
      await this.pages.addresses.addParty(role).click();
      await this.pages[picker].select(chosen);
      await this.pages[picker].saveAndContinue.click();
      await this.pages.addresses.heading.waitFor();
    }
    await this.pages.addresses.continueButton.click();
    await this.pages.cphNumber.heading.waitFor();
  }

  async answerAddresses(choices: AddressChoices = {}): Promise<void> {
    await this.fillAddressesToCph(choices);
    await this.pages.cphNumber.cphNumber.fill('12/345/6789');
    await this.pages.cphNumber.saveAndContinue.click();
    await this.pages.overview.heading.waitFor();
  }

  async fillArrivalDetails(means: string = 'Road Vehicle'): Promise<void> {
    await this.pages.arrivalDetails.fillArrivalDate(ARRIVAL_DATE);
    await this.pages.arrivalDetails.selectPort(PORT);
    await this.pages.page.getByRole('radio', { name: means, exact: true }).check();
    await this.pages.arrivalDetails.transportIdentification.fill('FR-892-LK');
    await this.pages.arrivalDetails.transportDocumentReference.fill('CMR-2026-884721');
  }

  // Re-navigate from the hub to the transporter-type page within an already
  // unlocked journey. The page itself saves through unfilled; it is filled
  // because a road vehicle keeps transited countries in scope, which is
  // answered on the way.
  async reachTransporterFromHub(): Promise<void> {
    await this.pages.overview.task('Arrival details').click();
    await this.pages.arrivalDetails.heading.waitFor();
    await this.fillArrivalDetails();
    await this.pages.arrivalDetails.saveAndContinue.click();
    await this.pages.transitedCountries.heading.waitFor();
    await this.pages.transitedCountries.selectCountry('France');
    await this.pages.transitedCountries.saveAndContinue.click();
    await this.pages.transporter.heading.waitFor();
  }

  async answerTransport(): Promise<void> {
    await this.pages.overview.task('Arrival details').click();
    await this.fillArrivalDetails();
    await this.pages.arrivalDetails.saveAndContinue.click();
    await this.pages.transitedCountries.heading.waitFor();
    await this.pages.transitedCountries.selectCountry('France');
    await this.pages.transitedCountries.selectCountry('Belgium');
    await this.pages.transitedCountries.saveAndContinue.click();
    await this.pages.transporter.heading.waitFor();
    await this.pages.transporter.transporterType('Commercial').check();
    await this.pages.transporter.saveAndContinue.click();
    await this.pages.transporterSelection.heading.waitFor();
    await this.pages.transporterSelection.transporter('García Livestock Transport SL').check();
    await this.pages.transporterSelection.saveAndContinue.click();
    await this.pages.overview.heading.waitFor();
  }

  async answerContact(): Promise<void> {
    await this.pages.overview.task('Contact address').click();
    await this.pages.contactAddress.address('Animal and Plant Health Agency').check();
    await this.pages.contactAddress.saveAndContinue.click();
    await this.pages.overview.heading.waitFor();
  }

  async completeAnswerSections(choices: AddressChoices = {}): Promise<void> {
    await this.answerOrigin({ requiresRegionCode: 'Yes', internalReference: 'Imports456GB' });
    await this.answerCommodity();
    await this.answerAnimalIdentification();
    await this.answerReasonAndAdditionalDetails();
    await this.answerAddresses(choices);
    await this.answerTransport();
    await this.answerContact();
  }

  // Reach helpers — land on a page UNFILLED so a per-page spec can drive it.
  // API-seeded notifications cannot be saved through the UI, so specs that submit
  // must reach the page through the real journey flow. The commodity section (and
  // everything downstream) is gated behind origin, so any reach past origin runs
  // unlockSections first.
  async toCommoditySelection(): Promise<void> {
    await this.startNotification();
    await this.pages.overview.task('What are you importing?').click();
    await this.pages.commoditySelection.heading.waitFor();
  }

  async toConsignmentDetails(): Promise<void> {
    await this.toCommoditySelection();
    await this.pages.commoditySelection.selectSpecies(['Bos taurus']);
    await this.pages.commoditySelection.saveAndContinue.click();
    await this.pages.consignmentDetails.heading.waitFor();
  }

  async toAnimalIdentification(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.pages.overview.task('Animal identification details').click();
    await this.pages.animalIdentification.heading.waitFor();
  }

  async toImportReason(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.pages.overview.task('Main reason for importing').click();
    await this.pages.importReason.heading.waitFor();
  }

  async toImportPurpose(): Promise<void> {
    await this.toImportReason();
    await this.pages.importReason.reason('Internal market').check();
    await this.pages.importReason.saveAndContinue.click();
    await this.pages.importPurpose.heading.waitFor();
  }

  async toAdditionalDetails(): Promise<void> {
    await this.toImportPurpose();
    await this.pages.importPurpose.purpose('Breeding').check();
    await this.pages.importPurpose.saveAndContinue.click();
    await this.pages.additionalDetails.heading.waitFor();
  }

  async toCphNumber(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.fillAddressesToCph();
  }

  async toArrivalDetails(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.pages.overview.task('Arrival details').click();
    await this.pages.arrivalDetails.heading.waitFor();
  }

  async toTransitedCountries(): Promise<void> {
    await this.toArrivalDetails();
    await this.fillArrivalDetails();
    await this.pages.arrivalDetails.saveAndContinue.click();
    await this.pages.transitedCountries.heading.waitFor();
  }

  async toTransporter(): Promise<void> {
    await this.toTransitedCountries();
    await this.pages.transitedCountries.selectCountry('France');
    await this.pages.transitedCountries.saveAndContinue.click();
    await this.pages.transporter.heading.waitFor();
  }

  async toTransporterSelection(): Promise<void> {
    await this.toTransporter();
    await this.pages.transporter.transporterType('Commercial').check();
    await this.pages.transporter.saveAndContinue.click();
    await this.pages.transporterSelection.heading.waitFor();
  }

  async toContactAddress(): Promise<void> {
    await this.startNotification();
    await this.unlockSections();
    await this.pages.overview.task('Contact address').click();
    await this.pages.contactAddress.heading.waitFor();
  }

  async toReview(): Promise<void> {
    if (!this.context.journeyId) await this.startNotification();
    await this.completeAnswerSections();
    await this.pages.overview.task('Check and submit').click();
    await this.pages.notificationView.heading.waitFor();
  }

  async toDeclaration(choices: AddressChoices = {}): Promise<void> {
    await this.startNotification();
    await this.completeAnswerSections(choices);
    await this.pages.overview.task('Check and submit').click();
    await this.pages.notificationView.heading.waitFor();
    await this.pages.notificationView.continueButton.click();
    await this.pages.declaration.heading.waitFor();
  }

  async submitNotification(choices: AddressChoices = {}): Promise<void> {
    await this.toDeclaration(choices);
    await this.pages.declaration.confirmation.check();
    await this.pages.declaration.continueButton.click();
    await this.pages.page.getByRole('heading', { name: 'Import notification submitted' }).waitFor();
  }
}
