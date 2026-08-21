import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { HomeServicesService } from '../services/home-services.service';
import { CreateBookingDto, SubmitQuoteDto } from '../dto/home-services.dto';

/**
 * HomeServicesController
 *
 * Customer + Provider endpoints for home services.
 * Customer: browse categories, create bookings, accept quotes, track.
 * Provider: accept bookings, submit quotes, lifecycle transitions.
 * Gated behind @RequireModule('home_services').
 */
@Controller('home-services')
export class HomeServicesController {
  constructor(private readonly homeServices: HomeServicesService) {}

  // --- Customer endpoints ---

  @Get('categories')
  async listCategories(@Req() req: any, @Query('parent') parentId?: string) {
    const tenantId = req.tenantId || req.user?.tenantId;
    const categories = await this.homeServices.listCategories(tenantId, parentId);
    return { categories };
  }

  @Get('categories/:id/price-cards')
  async getPriceCards(@Req() req: any, @Param('id') categoryId: string) {
    const tenantId = req.tenantId || req.user?.tenantId;
    const priceCards = await this.homeServices.getCategoryPriceCards(tenantId, categoryId);
    return { priceCards };
  }

  @Post('bookings')
  async createBooking(@Req() req: any, @Body() dto: CreateBookingDto) {
    const tenantId = req.tenantId || req.user?.tenantId; const userId = req.user?.sub;
    const booking = await this.homeServices.createBooking(tenantId, userId, dto);
    return { booking };
  }

  @Get('bookings')
  async listBookings(@Req() req: any) {
    const tenantId = req.tenantId || req.user?.tenantId; const userId = req.user?.sub;
    const bookings = await this.homeServices.listCustomerBookings(tenantId, userId);
    return { bookings };
  }

  @Get('bookings/:id')
  async getBooking(@Req() req: any, @Param('id') bookingId: string) {
    const tenantId = req.tenantId || req.user?.tenantId;
    const booking = await this.homeServices.getBooking(tenantId, bookingId);
    const quotes = await this.homeServices.getBookingQuotes(tenantId, bookingId);
    return { booking, quotes };
  }

  @Post('bookings/:id/accept-quote/:quoteId')
  async acceptQuote(@Req() req: any, @Param('id') bookingId: string, @Param('quoteId') quoteId: string) {
    const tenantId = req.tenantId || req.user?.tenantId; const userId = req.user?.sub;
    const booking = await this.homeServices.acceptQuote(tenantId, quoteId, userId);
    return { booking };
  }

  @Post('bookings/:id/cancel')
  async cancelBooking(@Req() req: any, @Param('id') bookingId: string) {
    const tenantId = req.tenantId || req.user?.tenantId;
    const booking = await this.homeServices.cancelBooking(tenantId, bookingId);
    return { booking };
  }

  // --- Provider endpoints ---

  @Post('provider/bookings/:id/accept')
  async acceptBooking(@Req() req: any, @Param('id') bookingId: string) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const booking = await this.homeServices.acceptBooking(tenantId, bookingId, providerId);
    return { booking };
  }

  @Post('provider/quotes')
  async submitQuote(@Req() req: any, @Body() dto: SubmitQuoteDto) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const quote = await this.homeServices.submitQuote(tenantId, providerId, dto);
    return { quote };
  }

  @Post('provider/bookings/:id/en-route')
  async markEnRoute(@Req() req: any, @Param('id') bookingId: string) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const booking = await this.homeServices.markEnRoute(tenantId, bookingId, providerId);
    return { booking };
  }

  @Post('provider/bookings/:id/start')
  async startJob(@Req() req: any, @Param('id') bookingId: string) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const booking = await this.homeServices.startJob(tenantId, bookingId, providerId);
    return { booking };
  }

  @Post('provider/bookings/:id/complete')
  async completeJob(@Req() req: any, @Param('id') bookingId: string, @Body() body: { photos?: string[] }) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const booking = await this.homeServices.completeJob(tenantId, bookingId, providerId, body.photos);
    return { booking };
  }

  @Get('provider/bookings')
  async listProviderBookings(@Req() req: any) {
    const tenantId = req.tenantId || req.user?.tenantId; const providerId = req.user?.sub;
    const bookings = await this.homeServices.listProviderBookings(tenantId, providerId);
    return { bookings };
  }
}
