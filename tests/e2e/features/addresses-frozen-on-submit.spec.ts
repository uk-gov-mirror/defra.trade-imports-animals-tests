import { type Locator } from '@playwright/test';
import { type PageObjects } from '@page-objects';
import { type AddressBookApiClient } from '@adapters/http/address-book-api-client';
import { test, expect } from '@fixtures';

/**
 * The inverse of addresses-live-link.spec.ts. A DRAFT resolves its address
 * references on every render, so it reflects edits in the address book. A
 * SUBMITTED notification must not: it is part of the legal record, and what it
 * shows is frozen onto it at submit.
 *
 * Submitted through the full UI journey rather than API-seeded, because the
 * declaration is gated on every task row being fulfilled.
 */
test.describe('Addresses are frozen once submitted', { tag: ['@integration'] }, () => {
  /** Its own record rather than a shared fixture: these specs edit and delete
   * the address they pick, and the fixtures are shared with every spec running
   * alongside them. Distinct names, not one derived from the other, so "the old
   * name is gone" is a real assertion rather than a substring match. */
  const ownAddress = async (addressBookApi: AddressBookApiClient, label: string) => {
    const stamp = Date.now();
    const originalName = `Frozen Farm ${label} ${stamp}`;
    const address = await addressBookApi.createAddress({
      name: originalName,
      addressLine1: '9 Freeze Lane',
      townOrCity: 'Carlisle',
      postcode: 'CA1 3CC',
      countryCode: 'United Kingdom',
      phone: '01228 555 0104',
      email: 'frozen@example.co.uk',
    });
    return { address, originalName, stamp };
  };

  const consignorValue = (pages: PageObjects): Locator =>
    pages.notificationView
      .summaryCard('Roles and addresses')
      .locator('.govuk-summary-list__row', { has: pages.page.getByText('Consignor', { exact: true }) })
      .locator('.govuk-summary-list__value');

  test('editing or deleting the address after submit changes nothing the notification shows', async ({
    journey,
    journeyContext,
    pages,
    addressBookApi,
  }) => {
    test.slow();
    const { address, originalName, stamp } = await ownAddress(addressBookApi, 'A');
    const renamed = `Moved Holding A ${stamp}`;

    await journey.submitNotification({ consignor: originalName });
    const journeyId = journeyContext.journeyId;

    // Rename and relocate the record behind the notification's back. A draft
    // would pick all of this up on the next render.
    await addressBookApi.updateAddress(address.id, {
      name: renamed,
      addressLine1: '9 Freeze Lane',
      townOrCity: 'Penrith',
      postcode: 'CA11 9ZZ',
      countryCode: 'United Kingdom',
      phone: '01228 555 0104',
      email: 'frozen@example.co.uk',
    });

    // The read-only check your answers view still reads the submission.
    await pages.notificationView.open(journeyId);
    await expect(consignorValue(pages)).toContainText(originalName);
    await expect(consignorValue(pages)).toContainText('Carlisle');
    await expect(consignorValue(pages)).toContainText('CA1 3CC');
    await expect(consignorValue(pages)).not.toContainText(renamed);
    await expect(consignorValue(pages)).not.toContainText('Penrith');

    // And so does the dashboard row, which resolves its own names.
    await pages.notificationDashboard.open();
    await pages.notificationDashboard.searchForReference(journeyId);
    await expect(pages.notificationDashboard.notificationCardDetails(0).consignor).toContainText(originalName);

    // Deleting it outright changes nothing either, and must not error. This is
    // the opposite of the draft rule, where a deleted address renders as "Not
    // added yet" — the address book has no say over a notification already sent.
    await addressBookApi.deleteAddress(address.id);
    expect((await addressBookApi.getAddress(address.id)).deleted).toBe(true);

    await pages.notificationView.open(journeyId);
    await expect(consignorValue(pages)).toContainText(originalName);
    await expect(consignorValue(pages)).toContainText('Carlisle');
    await expect(consignorValue(pages)).not.toContainText('Not added yet');
  });

  test('amending resolves the address live again, and cancelling restores the frozen details', async ({
    journey,
    journeyContext,
    pages,
    addressBookApi,
    notificationActions,
  }) => {
    test.slow();
    const { address, originalName, stamp } = await ownAddress(addressBookApi, 'B');
    const renamed = `Moved Holding B ${stamp}`;

    await journey.submitNotification({ consignor: originalName });
    const journeyId = journeyContext.journeyId;

    await addressBookApi.updateAddress(address.id, {
      name: renamed,
      addressLine1: '9 Freeze Lane',
      townOrCity: 'Penrith',
      postcode: 'CA11 9ZZ',
      countryCode: 'United Kingdom',
      phone: '01228 555 0104',
      email: 'frozen@example.co.uk',
    });

    // Submitted: frozen.
    await pages.notificationView.open(journeyId);
    await expect(consignorValue(pages)).toContainText(originalName);

    // Amending: the retained reference resolves live again, so the amendment is
    // made against the address as it stands now, not as it was.
    await notificationActions.amendNotification(journeyId);
    await pages.overview.task('Check and submit').click();
    await expect(pages.notificationView.heading).toBeVisible();
    await expect(consignorValue(pages)).toContainText(renamed);
    await expect(consignorValue(pages)).toContainText('Penrith');
    await expect(consignorValue(pages)).not.toContainText(originalName);

    // Cancelling the amendment puts back what was submitted — the frozen copy,
    // not a re-resolve of today's address book.
    await pages.notificationView.cancelAmendment.click();
    await expect(pages.notificationCancelAmend.heading).toBeVisible();
    await pages.notificationCancelAmend.confirm.click();

    await expect(pages.notificationView.journeyStrip).not.toContainText('Amending');
    await expect(consignorValue(pages)).toContainText(originalName);
    await expect(consignorValue(pages)).toContainText('Carlisle');
    await expect(consignorValue(pages)).not.toContainText(renamed);
  });
});
