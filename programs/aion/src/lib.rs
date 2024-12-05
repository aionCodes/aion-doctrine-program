use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use solana_security_txt::security_txt;

security_txt! {
    name: "Aion Doctrine Program",
    project_url: "https://github.com/aionCodes/aion-doctrine-program",
    contacts: "X: @AionFanatic",
    policy: "",
    preferred_languages: "en",
    auditors: "None"
}

//devnet
declare_id!("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");

pub const DOCTRINE_SEED: &[u8] = b"doctrine";
pub const CONFIG_SEED: &[u8] = b"config";
pub const PAGE_SEED: &[u8] = b"page";
pub const MESSAGES_PER_PAGE: usize = 100;  
pub const IPFS_CID_LENGTH: usize = 46;  // Standard IPFS CID length
pub const INITIAL_MESSAGE_COST: u64 = 100_000 * 1_000_000; // 100,000 token (6 decimals)
pub const COST_INCREASE_RATE: u64 = 101; // 1% increase = 101/100
pub const COST_INCREASE_DENOMINATOR: u64 = 100;

// Consistent page account size calculation
const PAGE_SPACE: usize = 8 + // discriminator
    32 + // doctrine: Pubkey
    4 + // page_number: u32
    8 + // Vec metadata (length + capacity)
    4 + (MESSAGES_PER_PAGE * (IPFS_CID_LENGTH + 8)) + // messages: Vec<Message> (with metadata)
    1; // bump: u8

#[program]
pub mod aion {
    use super::*;

    pub fn initialize_system(ctx: Context<InitializeSystem>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.token_mint = ctx.accounts.mint.key();
        config.bump = ctx.bumps.config;
        
        emit!(SystemInitializedEvent {
            config: config.key(),
            token_mint: config.token_mint,
        });
        Ok(())
    }

    pub fn initialize_doctrine(ctx: Context<InitializeDoctrine>, doctrine_id: u8) -> Result<()> {
        require!(doctrine_id > 0 && doctrine_id <= 10, ErrorCode::InvalidDoctrineId);
        
        let doctrine = &mut ctx.accounts.doctrine;
        doctrine.authority = ctx.accounts.authority.key();
        doctrine.doctrine_id = doctrine_id;
        doctrine.bump = ctx.bumps.doctrine;
        doctrine.total_messages = 0;
        doctrine.messages_per_page = MESSAGES_PER_PAGE as u32;
        doctrine.current_page_message_count = 0;
        doctrine.active_page_number = 0;
        doctrine.current_message_cost = INITIAL_MESSAGE_COST;
        
        let page = &mut ctx.accounts.first_page;
        page.doctrine = doctrine.key();
        page.page_number = 0;
        page.bump = ctx.bumps.first_page;
        page.messages = Vec::with_capacity(MESSAGES_PER_PAGE);
        
        emit!(DoctrineInitializedEvent {
            doctrine: doctrine.key(),
            doctrine_id,
        });
        Ok(())
    }

    pub fn add_message_to_current_page(ctx: Context<AddMessageToCurrentPage>, ipfs_cid: [u8; IPFS_CID_LENGTH]) -> Result<()> {
        let config = &ctx.accounts.config;
        let doctrine = &mut ctx.accounts.doctrine;
        let page = &mut ctx.accounts.page;
        
        require!(
            ctx.accounts.mint.key() == config.token_mint,
            ErrorCode::InvalidTokenMint
        );
        
        require!(
            page.doctrine == doctrine.key(),
            ErrorCode::InvalidPage
        );

        require!(
            page.page_number == doctrine.active_page_number,
            ErrorCode::InvalidPage
        );

        require!(
            page.messages.len() < MESSAGES_PER_PAGE,
            ErrorCode::PageIsFull
        );

        let current_cost = if doctrine.total_messages == 0 {
            INITIAL_MESSAGE_COST
        } else {
            doctrine.current_message_cost
        };
        
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                }
            ),
            current_cost,
        )?;

        page.messages.push(Message { ipfs_cid });
        
        let cid_str = std::str::from_utf8(&ipfs_cid).unwrap_or("Invalid UTF-8");
        let message_index = (page.messages.len() - 1) as u32;
        msg!("Added message with CID: {} at index: {}", cid_str, message_index);

        doctrine.total_messages += 1;
        doctrine.current_page_message_count += 1;

        doctrine.current_message_cost = current_cost
            .checked_mul(COST_INCREASE_RATE)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(COST_INCREASE_DENOMINATOR)
            .ok_or(ErrorCode::Overflow)?;

        emit!(MessageAddedEvent {
            doctrine: doctrine.key(),
            page: page.key(),
            message_index,
            ipfs_cid,
            cost: current_cost,
            next_cost: doctrine.current_message_cost,
        });
        
        Ok(())
    }

    pub fn add_message_to_new_page(ctx: Context<AddMessageToNewPage>, ipfs_cid: [u8; IPFS_CID_LENGTH]) -> Result<()> {
        let config = &ctx.accounts.config;
        let doctrine = &mut ctx.accounts.doctrine;
        let current_page = &ctx.accounts.current_page;
        let new_page = &mut ctx.accounts.new_page;
        
        require!(
            ctx.accounts.mint.key() == config.token_mint,
            ErrorCode::InvalidTokenMint
        );
        
        require!(
            current_page.messages.len() >= MESSAGES_PER_PAGE,
            ErrorCode::CurrentPageNotFull
        );

        require!(
            current_page.page_number < 255,
            ErrorCode::PageNumberOverflow
        );

        let current_cost = doctrine.current_message_cost;
        
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                }
            ),
            current_cost,
        )?;

        new_page.doctrine = doctrine.key();
        new_page.page_number = current_page.page_number + 1;
        new_page.bump = ctx.bumps.new_page;
        new_page.messages = Vec::with_capacity(MESSAGES_PER_PAGE);
        
        doctrine.active_page_number += 1;
        doctrine.current_page_message_count = 1;

        new_page.messages.push(Message { ipfs_cid });
        
        let cid_str = std::str::from_utf8(&ipfs_cid).unwrap_or("Invalid UTF-8");
        msg!("Added message with CID: {} at index: 0", cid_str);

        doctrine.total_messages += 1;

        doctrine.current_message_cost = current_cost
            .checked_mul(COST_INCREASE_RATE)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(COST_INCREASE_DENOMINATOR)
            .ok_or(ErrorCode::Overflow)?;

        emit!(MessageAddedEvent {
            doctrine: doctrine.key(),
            page: new_page.key(),
            message_index: 0,
            ipfs_cid,
            cost: current_cost,
            next_cost: doctrine.current_message_cost,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeSystem<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, SystemConfig>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(doctrine_id: u8)]
pub struct InitializeDoctrine<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 1 + 4 + 4 + 4 + 4 + 8,
        seeds = [DOCTRINE_SEED, &[doctrine_id]],
        bump
    )]
    pub doctrine: Account<'info, Doctrine>,
    
    #[account(
        init,
        payer = authority,
        space = PAGE_SPACE,
        seeds = [PAGE_SEED, DOCTRINE_SEED, &[doctrine_id], &0u32.to_le_bytes()],
        bump
    )]
    pub first_page: Account<'info, DoctrinePage>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMessageToCurrentPage<'info> {
    #[account(mut)]
    pub doctrine: Account<'info, Doctrine>,
    
    pub config: Account<'info, SystemConfig>,
    
    #[account(mut)]
    pub page: Account<'info, DoctrinePage>,
    
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMessageToNewPage<'info> {
    #[account(mut)]
    pub doctrine: Account<'info, Doctrine>,
    
    pub config: Account<'info, SystemConfig>,
    
    pub current_page: Account<'info, DoctrinePage>,
    
    #[account(
        init,
        payer = authority,
        space = PAGE_SPACE,
        seeds = [
            PAGE_SEED,
            DOCTRINE_SEED,
            &[doctrine.doctrine_id],
            &(current_page.page_number + 1).to_le_bytes()
        ],
        bump
    )]
    pub new_page: Account<'info, DoctrinePage>,
    
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct SystemConfig {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct Doctrine {
    pub authority: Pubkey,
    pub doctrine_id: u8,
    pub bump: u8,
    pub total_messages: u32,
    pub messages_per_page: u32,
    pub current_page_message_count: u32,
    pub active_page_number: u32,
    pub current_message_cost: u64,
}

#[account]
pub struct DoctrinePage {
    pub doctrine: Pubkey,
    pub page_number: u32,
    pub messages: Vec<Message>,
    pub bump: u8,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy)]
pub struct Message {
    pub ipfs_cid: [u8; IPFS_CID_LENGTH],
}

#[error_code]
pub enum ErrorCode {
   #[msg("Doctrine ID must be between 1 and 10")]
   InvalidDoctrineId,
   #[msg("Invalid token mint")]
   InvalidTokenMint,
   #[msg("Page number cannot exceed 255")]
   PageNumberOverflow,
   #[msg("Invalid page for this doctrine")]
   InvalidPage,
   #[msg("Page is full")]
   PageIsFull,
   #[msg("Current page must be full before creating next page")]
   CurrentPageNotFull,
   #[msg("Overflow in calculation")]
   Overflow,
}

#[event]
pub struct SystemInitializedEvent {
    pub config: Pubkey,
    pub token_mint: Pubkey,
}

#[event]
pub struct DoctrineInitializedEvent {
    pub doctrine: Pubkey,
    pub doctrine_id: u8,
}

#[event]
pub struct MessageAddedEvent {
    pub doctrine: Pubkey,
    pub page: Pubkey,
    pub message_index: u32,
    pub ipfs_cid: [u8; IPFS_CID_LENGTH],
    pub cost: u64,
    pub next_cost: u64,
}