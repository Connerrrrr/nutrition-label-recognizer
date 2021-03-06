import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import { PDFReader } from 'react-read-pdf';
import axios from 'axios';
import Cookies from 'js-cookie';
import NotificationSystem from 'react-notification-system';

import './Result.css';

import NavBar from '../components/Navigation.jsx';
import CreditPortal from '../components/CreditPortal.jsx';

class Result extends Component {

  constructor(props) {
    super(props);
    // get all saved data
    const prevState = this.props.location.state;
    this.state = {
      redirect: false,
      title: "Introduction",
      details: "1. All the nutrients that have been detected can be clicked (e.g. fat). After clicking, the detailed information about that nutrient will be shown.\n 2. If some nutrient you want to know more has not been detected, you can always use the key word search on the navigation bar.",
      x: 0,
      y: 0,
      nutriRangeArr: prevState.result,
      curNutri: "Default",
      image: URL.createObjectURL(prevState.image),
      imageHeight: prevState.result.height,
      imageWidth: prevState.result.width,
      imageId: prevState.result.id,
      showPdf: false,
      pdfPageNum: 1,
      pdfPageNumMax: 1,
      reportPdf: null,
      reportPdfDowload: null,
      reportSaved: false,
      msgBox: "",
      username: Cookies.get('username')
    };
  }

  // turn redirect flag to true
  setRedirect = () => {
    this.setState({
      redirect: true
    })
  }

  // redirect to home page when user wants to scan a new page
  uploadNewRedirect = () => {
    if (this.state.redirect) {
      return <Redirect to='/' />
    }
  }

  // get real-time coordinates of mouse
  _onMouseMove(e) {
    this.setState({
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY
    });
  }

  // find the corresponding factor of the user's mouse click from the scan result(nutriRangeArr)
  displayNutriInfo = () => {
    // get the current size of the result picture to find the zooming in/out ratio
    const zoomRatio = this.divElement.getBoundingClientRect().width / this.state.imageWidth;
    // find the corresponding factor that the user clicked on
    const nutrients = this.state.nutriRangeArr;
    let requestSent = false;
    Object.keys(nutrients).some((nutrient, index) => {
      if (nutrient !== "height" && nutrient !== "width" && nutrient !== "id") {
        const nutri = nutrients[nutrient];
        if (nutri.yMin <= (this.state.y / zoomRatio) && (this.state.y / zoomRatio) <= nutri.yMax) {
          this.setState({
            curNutri: nutrient
          });
          requestSent = true;
          this.getNutriDetails(nutrient);
          return;
        }
      }
    });
    if (!requestSent) this.addSorryNotification('this one is not detected');

  }

  // request backend for the current clicked factor's nutrition details and display the info
  getNutriDetails = async (nutriName) => {
    // notify user
    this.addNotification('Query has been sent. Please wait for result...');
    const response = await fetch('/api/nutrient/' + nutriName + '/');
    const body = await response.json();
    if (response.status !== 200) throw Error(body.message);
    if (body) {
      this.setState({
        title: body.name,
        details: body.details
      });
      // clean notifycation if this request is done successfully
      this.clearNotification();
    } else {
      this.clearNotification();
      this.addSorryNotification("we don't have enough infomation for " + nutriName);
    }
  };

  // handler for report button clicking on scanning result page
  showReport = async () => {
    // notify user
    this.addNotification('Report is generating. Please wait for it..');
    axios.defaults.withCredentials=true;
    try {
      await axios.get('/api/report/make/' + this.state.imageId + '/')
        .then(res => {
          this.setState({
            showPdf: true,
            reportPdf: 'https://cors-anywhere.herokuapp.com/' + res.data,
            reportPdfDowload: res.data
          });
          // clean notifycation if this request is done successfully
          this.clearNotification();
        });
    } catch (err) {
      console.log(err);
      // notify user
      this.addErrorNotification();
    }
  }

  // handler for back button clicking on scanning result page
  backToResult = () => {
    // check if this report has been saved already
    if (!this.state.reportSaved) {
      // send request and let backend know this report doesn't need to be saved
      this.sendSaveReportRequest(false);
    }
    // hide the pdf preview reader
    this.setState({
      showPdf: false
    });
  }

  // request backend for saving or not saving the current showing report
  sendSaveReportRequest = async (saveReport) => {
    // get request URL depending on if the current report needs to be saved or not
    const requestUrl = '/api/report/' + (saveReport? 'save' : 'unsave') + '/' + this.state.imageId;
    const response = await fetch(requestUrl);
    if (response.status !== 200) throw Error("something wrong...");
  };

  // handler for save button clicking on scanning result page
  saveReport = () => {
    // send request and let backend know this report needs to be saved
    this.sendSaveReportRequest(true);
    this.setState({
      reportSaved: true,
      msgBox: "This report has been successfully saved!"
    });
  }

  // handler for pdf previewer's previous page button clicking
  prevPdfPage = () => {
    // check if pdfPageNum will be less than 1 after this time of operation
    let newPdfPageNum = this.state.pdfPageNum - 1;
    newPdfPageNum = newPdfPageNum < 1 ? 1 : newPdfPageNum;
    this.setState({
      pdfPageNum: newPdfPageNum
    });
  }

  // handler for pdf previewer's next page button clicking
  nextPdfPage = () => {
    // check if pdfPageNum will be greater than the max page num of the
    // current file after this time of operation
    let pdfPageNumMax = this.state.pdfPageNumMax;
    let newPdfPageNum = this.state.pdfPageNum + 1;
    newPdfPageNum = newPdfPageNum > pdfPageNumMax ? pdfPageNumMax : newPdfPageNum;
    this.setState({
      pdfPageNum: newPdfPageNum
    });
  }

  // after loading the pdf file, the pdfPageNumMax will be reset by this function
  setPdfPageNumMax = (totalPage) => {
    this.setState({
      pdfPageNumMax: totalPage
    });
  }

  notificationSystem= React.createRef();

  // helper for adding a notification
  addNotification = (msg) => {
    const notification = this.notificationSystem.current;
    notification.addNotification({
      title: 'Waiting',
      message: msg,
      level: 'warning',
      dismissible: 'none',
      autoDismiss: 20,
    });
  };

  // helper for adding an error notification when an error occurred
  addErrorNotification = () => {
    const notification = this.notificationSystem.current;
    notification.addNotification({
      title: 'Error',
      message: 'Sorry, an error occurred. Please try again later...',
      level: 'error',
      dismissible: 'none',
      autoDismiss: 0,
    });
  };

  // helper for adding a notification when there is not enough support from DB
  addSorryNotification = (msg) => {
    const notification = this.notificationSystem.current;
    notification.addNotification({
      title: 'Sorry',
      message: 'Sorry, ' + msg + '. We will make nuXpert better...',
      level: 'info',
      dismissible: 'none',
      autoDismiss: 3,
    });
  };


  // helper for clearing all notifications
  clearNotification = () => {
    const notification = this.notificationSystem.current;
    notification.clearNotifications();
  };


  render() {
    // divide components to two display views (1. scanning result 2. PDF report preview)
    const showPdf = this.state.showPdf;
    let displayView;
    if(!showPdf) {
      let reportButton = (
        <p className="msg-box">
          Please log in to get the ability of generating a PDF report.
        </p>
      );
      if (this.state.username) {
        reportButton = (
          <button
            className="btn btn-primary btn-lg mt-2 btn-report"
            type="button"
            onClick={ this.showReport }
          >
            Generate PDF Report
          </button>
        );
      }
      displayView = (
        <div>
          { reportButton }
          <div className="row row-eq-height mt-2">
            <div className="col-sm-12 col-md-7">
              <div className="card mb-4 bg-secondary border border-primary result-card">
                <div ref={ (divElement) => this.divElement = divElement } >
                  <img
                    className="card-img-top"
                    onClick={ this.displayNutriInfo }
                    onMouseMove={ this._onMouseMove.bind(this) }
                    src={ this.state.image }
                    alt="Nutrition Fact Table"
                  ></img>
                </div>
                <div className="card-body text-center">
                  { this.uploadNewRedirect() }
                  <button
                    className="btn btn-primary btn-reupload"
                    type="button"
                    name="button"
                    onClick={ this.setRedirect }
                  >
                    Upload New
                  </button>
                </div>
              </div>
            </div>
            <div className="col">
              <div className="card bg-secondary border border-primary">
                <div className="card-body text-center">
                  <div className="container">
                    <h2 className="card-title">{ this.state.title.toUpperCase() }</h2>
                    <br/>
                    <p className="card-text text-left">
                    {
                      this.state.details.split('\n').map((paragraph, key) => {
                        return <span key={ key }>{ paragraph }<br/><br/></span>
                      })
                    }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      displayView = (
        <div>
          <div>
            <button
              className="btn btn-primary btn-lg mt-2 btn-preview-pdf"
              type="button"
              onClick={ this.backToResult }
              alter="Back to scanning report"
            >
              Back
            </button>
            <button
              className="btn btn-primary btn-lg mt-2 btn-preview-pdf"
              type="button"
              alter="Save to my account"
              onClick={ this.saveReport }
            >
              Save
            </button>
            <a
              className="btn btn-primary btn-lg mt-2 btn-preview-pdf"
              href={ this.state.reportPdfDowload }
              download="Report.pdf"
              alter="Download this report"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
            <p className="msg-box">{ this.state.msgBox }</p>
          </div>
          <div className="btn-flex-container">
            <button
              className="btn btn-primary btn-sm mt-2"
              type="button"
              onClick={ this.prevPdfPage }
              alter="Previous page"
            >
              Prev
            </button>
            <button
              className="btn btn-primary btn-sm mt-2"
              type="button"
              onClick={ this.nextPdfPage }
              alter="Previous page"
            >
              Next
            </button>
          </div>
          <PDFReader
            className="pdf-reader"
            url={ this.state.reportPdf }
            page={ this.state.pdfPageNum }
            onDocumentComplete={ this.setPdfPageNumMax }
          />
        </div>
      );
    }

    return (
      <div className="container">
        <NavBar { ...this.props }/>
        <NotificationSystem ref={this.notificationSystem} />
        { displayView }
        <CreditPortal />
      </div>
    );
  }
}

export default Result;
