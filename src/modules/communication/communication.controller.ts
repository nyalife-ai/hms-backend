/**
 * Staff messaging HTTP API — /messages/*
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { STAFF_MESSAGE_ROLES } from '../auth/role-sets';
import { MAX_ATTACHMENT_BYTES } from './constants/messaging.constants';
import {
  CreateConversationDto,
  EditMessageDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MarkDeliveredDto,
  MarkReadDto,
  MuteConversationDto,
  ReactionDto,
  SearchUsersQueryDto,
  SendMessageDto,
  AddParticipantsDto,
} from './dto';
import { MessagingService } from './services/messaging.service';

type UploadedAttachment = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF_MESSAGE_ROLES, 'SUPER_ADMIN')
@Controller('messages')
export class CommunicationController {
  public constructor(private readonly messaging: MessagingService) {}

  @Get('users/search')
  @ApiOperation({ summary: 'Search staff directory for messaging' })
  searchUsers(
    @Query() query: SearchUsersQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.searchUsers(user.id, query);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations for the current user' })
  listConversations(
    @Query() query: ListConversationsQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.listConversations(user.id, query);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create a conversation (or reuse DIRECT)' })
  createConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.createConversation(user.id, body);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a conversation by id' })
  getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.getConversation(user.id, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'List messages (cursor pagination)' })
  listMessages(
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.listMessages(user.id, id, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message' })
  sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.sendMessage(user.id, id, body);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation read up to a message' })
  markRead(
    @Param('id') id: string,
    @Body() body: MarkReadDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.markRead(user.id, id, body.upToMessageId);
  }

  @Patch('conversations/:id/mute')
  @ApiOperation({ summary: 'Mute or unmute a conversation' })
  mute(
    @Param('id') id: string,
    @Body() body: MuteConversationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.setMuted(user.id, id, body.muted);
  }

  @Post('conversations/:id/participants')
  @ApiOperation({ summary: 'Add participants to a group conversation' })
  addParticipants(
    @Param('id') id: string,
    @Body() body: AddParticipantsDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.addParticipants(
      user.id,
      id,
      body.userIds,
      user.role,
    );
  }

  @Delete('conversations/:id/participants/:userId')
  @ApiOperation({ summary: 'Remove a participant or leave a conversation' })
  removeParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.removeParticipant(
      user.id,
      id,
      userId,
      user.role,
    );
  }

  @Post('conversations/:id/attachments')
  @ApiOperation({ summary: 'Upload an attachment (returns uploadRef)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @CurrentUser() user: AuthUserPublic,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    return this.messaging.uploadAttachment(user.id, id, {
      buffer: file.buffer,
      originalname: file.originalname || 'file',
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Get('attachments/:id/download')
  @ApiOperation({ summary: 'Get attachment download metadata / signed URL' })
  downloadAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.getAttachmentDownload(user.id, id);
  }

  @Get('attachments/:id/content')
  @ApiOperation({ summary: 'Stream attachment content (authenticated)' })
  async streamAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.messaging.getAttachmentBuffer(user.id, id);
    const mimeType = file.mimeType || 'application/octet-stream';
    const inline =
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      mimeType === 'application/pdf';
    const safeName = (file.fileName || 'attachment').replace(/"/g, '');
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Content-Length': String(file.buffer.length),
    });
    return new StreamableFile(file.buffer);
  }

  @Patch('messages/:id')
  @ApiOperation({ summary: 'Edit a message (within edit window)' })
  editMessage(
    @Param('id') id: string,
    @Body() body: EditMessageDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.editMessage(user.id, id, body.body);
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: 'Soft-delete a message' })
  deleteMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.softDeleteMessage(user.id, id);
  }

  @Post('messages/:id/reactions')
  @ApiOperation({ summary: 'Add a reaction' })
  addReaction(
    @Param('id') id: string,
    @Body() body: ReactionDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.addReaction(user.id, id, body.reactionType);
  }

  @Delete('messages/:id/reactions/:reactionType')
  @ApiOperation({ summary: 'Remove a reaction' })
  removeReaction(
    @Param('id') id: string,
    @Param('reactionType') reactionType: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.removeReaction(
      user.id,
      id,
      decodeURIComponent(reactionType),
    );
  }

  @Post('delivered')
  @ApiOperation({ summary: 'Mark messages as delivered for current user' })
  markDelivered(
    @Body() body: MarkDeliveredDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.messaging.markDelivered(user.id, body.messageIds);
  }
}
