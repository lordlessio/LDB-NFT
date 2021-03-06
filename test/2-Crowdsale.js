const TavernNFTs = artifacts.require('TavernNFTs');
const NFTCsrowdsale = artifacts.require('NFTsCrowdsale');
const Erc20TokenMock = artifacts.require('LORDLESS_TOKEN');
const { duration, increaseTime } = require('./helpers/increaseTime');
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NFTsCrowdsale', function (accounts) {
  before(async function () {
    // Maximum allowable error
    this.maError = parseInt(web3.toWei(1, 'gwei'));
    this.eth2erc20 = 41666;
    this.price = 0.5e18;
    this.ethPrice = parseInt(this.price / this.eth2erc20);
    this._tokenId = 1;
    this._tokenId2 = 2;
    this._tokenId3 = 3;
    this.seller = accounts[0];
    this.buyer = accounts[1];
    this.startAt = web3.eth.getBlock('latest').timestamp;
    this.startAt_1min = web3.eth.getBlock('latest').timestamp + duration.minutes(1);
    this.endAt = web3.eth.getBlock('latest').timestamp + duration.minutes(5);
  });
  beforeEach(async function () {
    this.TavernNFTs = await TavernNFTs.new('Tavern NFT', 'Tavern', { from: accounts[0] });
    this.erc20Token = await Erc20TokenMock.new();
    this.NFTsCrowdsale = await NFTCsrowdsale.new(this.TavernNFTs.address, this.erc20Token.address, this.eth2erc20);
    // mint erc20 token
    await this.erc20Token.mint(accounts[0], 5e27);
    await this.erc20Token.mint(accounts[1], 5e27);
    // mint erc721 token
    await this.TavernNFTs.mint(accounts[0], this._tokenId);
    await this.TavernNFTs.mint(accounts[0], this._tokenId2);
    await this.TavernNFTs.mint(accounts[2], this._tokenId3);
    // Set Approval For Crowdsale Contract
    await this.TavernNFTs.setApprovalForAll(this.NFTsCrowdsale.address, true, { from: accounts[0] });
    await this.TavernNFTs.setApprovalForAll(this.NFTsCrowdsale.address, true, { from: accounts[2] });

    // new auction
    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId, this.startAt, this.endAt, { from: this.seller });

    await this.erc20Token.approve(this.NFTsCrowdsale.address, 1e27, { from: this.buyer });
  });

  it('should get auction success', async function () {
    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId2, this.startAt, this.endAt);
    const auction = await this.NFTsCrowdsale.getAuction.call(this._tokenId2);
    // should be seller
    auction[1].should.be.equal(accounts[0]);
    // should be price
    auction[2].should.be.bignumber.equal(this.price);
    //  should be startAt
    auction[3].should.be.bignumber.equal(this.startAt);
    //  should be endAt
    auction[4].should.be.bignumber.equal(this.endAt);
    // should be token_id
    auction[5].should.be.bignumber.equal(this._tokenId2);
  });

  it('startAt should not set success by error contract owner', async function () {

    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId3, this.startAt, this.endAt, { from: accounts[2] });
    const auction = await this.NFTsCrowdsale.getAuction.call(this._tokenId2);
    auction[3].should.be.not.bignumber.equal(this.startAt);
    
  });

  /**
   * Defray Function Test
   */
  
  it('less ether pay: should revert', async function () {
    const buyer = accounts[1];
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: parseInt(this.ethPrice / 2),
      from: buyer,
    }).should.be.rejectedWith('revert');
  });

  it('pay with pay excess be should return of ', async function () {
    const payExcess = 1e18;
    const gasPrice = 100;
    const preBalance = (await web3.eth.getBalance(this.buyer)).toNumber();
    const receipt = await this.NFTsCrowdsale.payByEth(this._tokenId, {
      gasPrice,
      value: this.ethPrice + payExcess,
      from: this.buyer,
    });
    const afterDefrayBalance = (await web3.eth.getBalance(this.buyer)).toNumber();
    const gasCost = receipt.receipt.gasUsed * gasPrice;
    // payExcess should be return of
    (afterDefrayBalance - (preBalance - this.ethPrice - gasCost)).should.be.below(this.maError);
  });
  describe('pay by eth: success', function () {
    beforeEach(async function () {
      // pay success
      this.preBalance = (await web3.eth.getBalance(this.seller)).toNumber();
      const { logs } = await this.NFTsCrowdsale.payByEth(this._tokenId, {
        value: this.price,
        from: this.buyer,
      });
      this.logs = logs;
    });

    it('shuould change token ownership', async function () {
      // check ownership of _tokenId should be change to buyer
      (await this.TavernNFTs.ownerOf(this._tokenId)).should.be.equal(this.buyer);
    });

    it('shuould add price_count ether to seller', async function () {
      const finalCount = (await web3.eth.getBalance(this.seller)).toNumber();
      const computedCount = this.preBalance + this.price;
      // error less than 1gwei
      (finalCount - computedCount).should.be.below(this.maError);
    });
    it('events: PayByEth', async function () {
      this.logs[0].event.should.be.equal('PayByEth');
      this.logs[0].args.seller.should.be.equal(this.seller);
      this.logs[0].args.buyer.should.be.equal(this.buyer);
      this.logs[0].args.price.should.be.bignumber.equal(this.price);
      this.logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
      this.logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);
    });
  });
  describe('pay by erc20: success', function () {
    beforeEach(async function () {
      // pay success
      this.preBalance = (await web3.eth.getBalance(this.seller)).toNumber();
      const { logs } = await this.NFTsCrowdsale.payByErc20(this._tokenId, {
        from: this.buyer,
      });
      this.logs = logs;
    });

    it('shuould change token ownership', async function () {
      // check ownership of _tokenId should be change to buyer
      (await this.TavernNFTs.ownerOf(this._tokenId)).should.be.equal(this.buyer);
    });

    it('shuould add price_count ether to seller', async function () {
      const finalCount = (await web3.eth.getBalance(this.seller)).toNumber();
      const computedCount = this.preBalance + this.price;
      // error less than 1gwei
      (finalCount - computedCount).should.be.below(this.maError);
    });

    it('events: PayByErc20', async function () {
      this.logs[0].event.should.be.equal('PayByErc20');
      this.logs[0].args.seller.should.be.equal(this.seller);
      this.logs[0].args.buyer.should.be.equal(this.buyer);
      this.logs[0].args.price.should.be.bignumber.equal(this.price);
      this.logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
      this.logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);
    });
  });
  describe('Time expired', async function () {
    it('payByEth time expired should be revert', async function () {
      await increaseTime(600);
      await this.NFTsCrowdsale.payByEth(this._tokenId, {
        value: this.price,
        from: this.buyer,
      }).should.be.rejectedWith('revert');
    });

    it('time expired cancelAuction should be success', async function () {
      await increaseTime(600);
      await this.NFTsCrowdsale.cancelAuction(this._tokenId);
      (await this.NFTsCrowdsale.isOnAuction.call(this._tokenId)).should.be.equal(false);
    });
  });
  
  it('isOnAuction should be true && when preSale isOnAuction should be false', async function () {
    (await this.NFTsCrowdsale.isOnAuction.call(this._tokenId)).should.be.equal(true);

    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId2, this.startAt_1min, this.endAt);
    // pre sale should be true
    (await this.NFTsCrowdsale.isOnPreAuction.call(this._tokenId2)).should.be.equal(true);
    // when pre sale isOnAuction should be false
    (await this.NFTsCrowdsale.isOnAuction.call(this._tokenId2)).should.be.equal(false);
    
  });

  it('isOnAuction should be false after cancelAuction ', async function () {
    const { logs } = await this.NFTsCrowdsale.cancelAuction(this._tokenId);
    (await this.NFTsCrowdsale.isOnAuction.call(this._tokenId)).should.be.equal(false);

    // events
    logs[0].event.should.be.equal('CancelAuction');
    logs[0].args.seller.should.be.equal(this.seller);
    logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);

    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId, this.startAt, this.endAt, { from: this.seller });
  });

  it('Pause & UnPause', async function () {
    // Pause payByEth
    await this.NFTsCrowdsale.pause();
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: this.price,
      from: this.buyer,
    }).should.be.rejectedWith('revert');

    // unpause payByEth
    await this.NFTsCrowdsale.unpause();
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: this.price,
      from: this.buyer,
    }).should.to.not.rejectedWith('revert');
    
  });

  it('Pause2 & UnPause2', async function () {
    
    // Pause payByErc20
    await this.NFTsCrowdsale.pause2();
    await this.NFTsCrowdsale.payByErc20(this._tokenId, {
      from: this.buyer,
    }).should.to.be.rejectedWith('revert');

    // unpause payByErc20
    await this.NFTsCrowdsale.unpause2();
    await this.NFTsCrowdsale.payByErc20(this._tokenId, {
      from: this.buyer,
    }).should.to.not.rejectedWith('revert');
  });

  // events
  it('event: NewAuction', async function () {
    const _tokenId = 100;
    await this.TavernNFTs.mint(this.seller, _tokenId);
    const { logs } = await this.NFTsCrowdsale.newAuction(this.price, _tokenId, this.startAt, this.endAt, { from: this.seller });
    logs[0].event.should.be.equal('NewAuction');
    logs[0].args.seller.should.be.equal(this.seller);
    logs[0].args.price.should.be.bignumber.equal(this.price);
    logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
    logs[0].args.tokenId.should.be.bignumber.equal(_tokenId);
  });
  // batch
  it('batchNewAuctions && batchCancelAuction', async function () {

    const mockData = {
      10 : { tokenId: 10,price: 1e18, startAt: 1535012056, endAt: 1564990276 },
      11 : { tokenId: 11,price: 2e18, startAt: 1535012056, endAt: 1564990276 },
      12 : { tokenId: 12,price: 3e18, startAt: 1535012056, endAt: 1564990276 },
      13 : { tokenId: 13,price: 4e18, startAt: 1535012056, endAt: 1564990276 },
      14 : { tokenId: 14,price: 5e18, startAt: 1535012056, endAt: 1564990276 },
    }
    const prices = Object.keys(mockData).map(i => mockData[i].price);
    const tokenIds = Object.keys(mockData).map(i => mockData[i].tokenId);
    const startAts = Object.keys(mockData).map(i => mockData[i].startAt);
    const endAts = Object.keys(mockData).map(i => mockData[i].endAt);
    // console.log(prices, tokenIds, endAts)
    const tos = new Array(tokenIds.length).fill(accounts[0]);
    // console.log('tos', tos);
    await this.TavernNFTs.batchMint(tos, tokenIds);
    await this.NFTsCrowdsale.batchNewAuctions(prices, tokenIds, startAts, endAts);
    
    const checkNewAuctions = tokenIds.map(async tokenId => {
      return this.NFTsCrowdsale.getAuction.call(tokenId).then(
        auction => {
          let mock = mockData[tokenId]
          auction[2].should.be.bignumber.equal(mock.price);
          auction[3].should.be.bignumber.equal(mock.startAt);
          auction[4].should.be.bignumber.equal(mock.endAt);
          auction[5].should.be.bignumber.equal(mock.tokenId);
        }
      )
    })
    await Promise.all(checkNewAuctions);

    // batch new auctions
    await this.NFTsCrowdsale.batchCancelAuctions(tokenIds);
    const checkCancelAuctions = tokenIds.map(async tokenId => {
      return this.NFTsCrowdsale.isOnAuction.call(tokenId).then(isOnAuction => {
        isOnAuction.should.be.equal(false);
      })
    })
    await Promise.all(checkCancelAuctions);
  });
});